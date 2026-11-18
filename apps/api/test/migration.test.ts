import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { appDirectory } from "../src/config";

const BILLING = "20261118070000_billing";
const PRISMA = join(appDirectory, "prisma");

/**
 * A database that is on the previous release when the billing migration
 * arrives must be refused, not rewritten, when old rows break a new CHECK.
 */
describe("billing migration pre-checks", () => {
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const url = new URL(
        process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
    );
    url.searchParams.set("schema", schema);
    const directory = mkdtempSync(join(tmpdir(), "xboard-migration-"));
    const client = new PrismaClient({ datasources: { db: { url: url.href } } });

    function deploy() {
        return spawnSync(
            "pnpm",
            [
                "exec",
                "prisma",
                "migrate",
                "deploy",
                "--schema",
                join(directory, "schema.prisma"),
            ],
            {
                cwd: appDirectory,
                env: { ...process.env, DATABASE_URL: url.href },
                encoding: "utf8",
            },
        );
    }

    before(() => {
        cpSync(join(PRISMA, "schema.prisma"), join(directory, "schema.prisma"));
        mkdirSync(join(directory, "migrations"));
        cpSync(
            join(PRISMA, "migrations", "migration_lock.toml"),
            join(directory, "migrations", "migration_lock.toml"),
        );
        for (const name of readdirSync(join(PRISMA, "migrations")).sort()) {
            if (name >= BILLING || name.endsWith(".toml")) continue;
            cpSync(
                join(PRISMA, "migrations", name),
                join(directory, "migrations", name),
                { recursive: true },
            );
        }
        const first = deploy();
        assert.equal(first.status, 0, first.stderr);
    });
    after(async () => {
        await client.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await client.$disconnect();
        rmSync(directory, { recursive: true, force: true });
    });

    it("names the table, count and cleanup instead of rewriting old rows", async () => {
        await client.$executeRawUnsafe(
            `INSERT INTO "Plan" ("name", "transferEnable", "updatedAt") VALUES ('free', 1000, now()) RETURNING id`,
        );
        const [plan] = await client.$queryRawUnsafe<{ id: number }[]>(
            `SELECT id FROM "Plan" LIMIT 1`,
        );
        await client.$executeRawUnsafe(
            `INSERT INTO "PlanPrice" ("planId", "period", "amountMinor") VALUES (${plan!.id}, 'monthly', 0)`,
        );
        cpSync(
            join(PRISMA, "migrations", BILLING),
            join(directory, "migrations", BILLING),
            { recursive: true },
        );
        const blocked = deploy();
        assert.notEqual(blocked.status, 0);
        const output = blocked.stdout + blocked.stderr;
        assert.match(
            output,
            /billing migration blocked: table "PlanPrice" has 1 row/,
        );
        assert.match(output, /Cleanup:/);
        // Nothing was touched by the failed migration.
        const rows = await client.$queryRawUnsafe<{ amount: number }[]>(
            `SELECT "amountMinor" AS amount FROM "PlanPrice"`,
        );
        assert.equal(rows[0]?.amount, 0);
    });

    it("applies after the operator fixes the reported rows", async () => {
        await client.$executeRawUnsafe(
            `UPDATE "PlanPrice" SET "amountMinor" = 100`,
        );
        // Prisma refuses to continue after a failed migration until it is resolved.
        const resolved = spawnSync(
            "pnpm",
            [
                "exec",
                "prisma",
                "migrate",
                "resolve",
                "--rolled-back",
                BILLING,
                "--schema",
                join(directory, "schema.prisma"),
            ],
            {
                cwd: appDirectory,
                env: { ...process.env, DATABASE_URL: url.href },
                encoding: "utf8",
            },
        );
        assert.equal(resolved.status, 0, resolved.stderr + resolved.stdout);
        const done = deploy();
        assert.equal(done.status, 0, done.stderr + done.stdout);
    });
});
