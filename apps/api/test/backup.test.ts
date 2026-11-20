import assert from "node:assert/strict";
import { execFile, spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
    mkdir,
    mkdtemp,
    readFile,
    rename,
    rm,
    writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { appDirectory } from "../src/config";
import { db } from "../src/db";
import { dumpTarget, runBackup } from "../src/jobs/backup";
import { applicationKey } from "../src/modules/system/secrets";
import { ORIGIN, startTestApp } from "./helpers";

const run = promisify(execFile);
const toolsAvailable = [
    "pg_dump",
    "pg_restore",
    "age",
    "age-keygen",
    "tar",
].every(
    (tool) => spawnSync(tool, ["--version"], { stdio: "ignore" }).status === 0,
);

async function tableCounts(client: PrismaClient) {
    const tables = await client.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
        ORDER BY tablename
    `;
    return Promise.all(
        tables.map(async ({ tablename }) => {
            const [row] = await client.$queryRawUnsafe<{ count: bigint }[]>(
                `SELECT count(*) AS count FROM "${tablename.replaceAll('"', '""')}"`,
            );
            return [tablename, row?.count];
        }),
    );
}

async function checkRestoredApi(
    url: URL,
    folder: string,
    email: string,
    password: string,
    token: string,
) {
    const secrets = join(folder, "secrets");
    await mkdir(secrets, { mode: 0o700 });
    await rename(join(folder, "app.key"), join(secrets, "app.key"));
    const env = {
        ...process.env,
        DATABASE_URL: url.toString(),
        APP_DATA_DIR: folder,
    };
    await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
        cwd: appDirectory,
        env,
    });
    const app = spawn(
        process.execPath,
        [
            "--import",
            "tsx",
            "--input-type=module",
            "-e",
            `
        import { createApp } from './src/app.ts';
        const app = createApp({ logging: false });
        await app.listen(0, '127.0.0.1');
        console.log(app.getUrl());
    `,
        ],
        { cwd: appDirectory, env },
    );
    try {
        const [ready] = await once(app.stdout, "data", {
            signal: AbortSignal.timeout(15_000),
        });
        const origin = Buffer.from(ready).toString().trim();
        const login = await fetch(`${origin}/api/auth/login`, {
            method: "POST",
            headers: { origin: ORIGIN, "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        assert.equal(login.status, 200);
        const cookie = login.headers.getSetCookie()[0]?.split(";", 1)[0];
        assert.ok(cookie);
        const storage = await fetch(
            `${origin}/api/admin/settings/backup/test`,
            {
                method: "POST",
                headers: { origin: ORIGIN, cookie },
            },
        );
        assert.equal(storage.status, 200);
        const subscription = await fetch(
            `${origin}/api/subscription/${token}?format=mihomo`,
        );
        assert.equal(subscription.status, 200);
        assert.match(await subscription.text(), /backup\.example\.test/);
    } finally {
        if (app.exitCode === null && app.signalCode === null) {
            const exited = once(app, "exit");
            app.kill();
            await exited;
        }
    }
}

it("hands pg_dump a connection string libpq reads the same on every version", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
        "postgresql://xboard:p%40ss@127.0.0.1:5432/xboard?schema=test_1&options=-c%20TimeZone%3DAsia%2FShanghai&connection_limit=5&application_name=a%2Bb";
    try {
        const target = dumpTarget();
        assert.equal(target.password, "p@ss");
        assert.equal(target.schema, "test_1");
        const url = new URL(target.url);
        assert.equal(url.password, "");
        // No Prisma-only parameters, and no "+" that libpq 17 would keep as a
        // literal plus instead of a space.
        assert.equal(
            url.search,
            "?options=-c%20TimeZone%3DAsia%2FShanghai&application_name=a%2Bb",
        );
    } finally {
        process.env.DATABASE_URL = previous;
    }
});

it(
    "encrypts a full backup, uploads retention copies once, and restores the database and key",
    {
        skip: toolsAvailable
            ? false
            : "Requires PostgreSQL client tools, age and tar",
    },
    async () => {
        const objects = new Map<string, Buffer>();
        const storage = createServer(async (req, res) => {
            const key = req.url?.split("?")[0] ?? "";
            if (req.method === "PUT") {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(Buffer.from(chunk));
                objects.set(key, Buffer.concat(chunks));
                res.writeHead(200, { ETag: '"test"' }).end();
                return;
            }
            const value = objects.get(key);
            if (value)
                res.writeHead(200, { "Content-Length": value.length }).end(
                    value,
                );
            else res.writeHead(404).end();
        });
        storage.listen(0, "127.0.0.1");
        await once(storage, "listening");
        const folder = await mkdtemp(join(tmpdir(), "xboard-backup-restore-"));
        const test = await startTestApp();
        const destination = `xboard_restore_${randomUUID().replaceAll("-", "")}`;
        let restored: PrismaClient | undefined;
        let createdDatabase = false;
        try {
            const identity = join(folder, "identity");
            await run("age-keygen", ["-o", identity]);
            const { stdout: publicKey } = await run("age-keygen", [
                "-y",
                identity,
            ]);
            const key = applicationKey();
            const password = "backup-fixture-password";
            const token = randomBytes(32).toString("base64url");
            const plan = await db.plan.create({
                data: { name: "Backup", transferEnable: 1000n },
            });
            await db.node.create({
                data: {
                    name: "Backup",
                    host: "backup.example.test",
                    protocol: "shadowsocks",
                    port: 443,
                    serverPort: 443,
                    tokenHash: "test-only",
                    enabled: true,
                    plans: { create: { planId: plan.id } },
                },
            });
            const viewer = await test.createUser(
                "backup-viewer@example.test",
                password,
                {
                    role: "admin",
                    balance: 2400,
                    subscribeToken: token,
                    planId: plan.id,
                    transferEnable: plan.transferEnable,
                },
            );
            await db.balanceEntry.create({
                data: {
                    userId: viewer.id,
                    actorId: viewer.id,
                    amountMinor: 2400,
                    reason: "Backup test",
                },
            });
            const cookie = await test.cookieFor(viewer.email, password);
            const endpoint = `http://127.0.0.1:${(storage.address() as AddressInfo).port}`;
            const configure = await test.call("/admin/settings/backup", {
                cookie,
                method: "PUT",
                body: {
                    backupEnabled: true,
                    backupStorage: "s3",
                    backupS3Endpoint: endpoint,
                    backupS3Region: "us-east-1",
                    backupS3ForcePathStyle: true,
                    backupBucket: "xboard-test",
                    backupPrefix: "panel",
                    backupAccessKeyId: "test",
                    backupSecretAccessKey: "test-secret",
                    backupAgeRecipient: publicKey.trim(),
                },
            });
            assert.equal(configure.status, 200, await configure.clone().text());
            assert.equal(
                (
                    await test.call("/admin/settings/backup/test", {
                        cookie,
                        method: "POST",
                    })
                ).status,
                200,
            );
            assert.equal(
                [...objects.keys()].filter(
                    (name) =>
                        name.includes("/xboard-test/") &&
                        name.includes("/panel/xboard-test/"),
                ).length,
                1,
            );
            const countsBefore = await tableCounts(db);
            const now = new Date("2026-02-01T04:00:00.000Z"); // Sunday and the first of the month in Beijing.
            await Promise.all([runBackup(now), runBackup(now)]);
            const backups = await db.backupRun.findMany();
            assert.equal(backups.length, 1);
            assert.equal(backups[0]?.status, "completed");
            assert.deepEqual(
                backups[0]?.objects.map((name) => name.split("/")[1]),
                ["daily", "weekly", "monthly"],
            );
            const encrypted = objects.get(
                `/xboard-test/${backups[0]!.objects[0]}`,
            )!;
            assert.ok(encrypted.length > 0);
            assert.match(
                encrypted.subarray(0, 25).toString("utf8"),
                /^age-encryption.org\/v1/,
            );
            const archive = join(folder, "backup.tar.age");
            await writeFile(archive, encrypted, { mode: 0o600 });
            await run("age", [
                "--decrypt",
                "--identity",
                identity,
                "--output",
                join(folder, "bundle.tar"),
                archive,
            ]);
            await run("tar", ["-C", folder, "-xf", join(folder, "bundle.tar")]);
            assert.equal(
                (await readFile(join(folder, "app.key"), "utf8")).trim(),
                key,
            );

            await db.$executeRawUnsafe(`CREATE DATABASE "${destination}"`);
            createdDatabase = true;
            const target = new URL(process.env.DATABASE_URL!);
            target.pathname = `/${destination}`;
            const libpq = new URL(target);
            const pgPassword = decodeURIComponent(libpq.password);
            libpq.password = "";
            libpq.search = "";
            await run(
                "pg_restore",
                [
                    "--exit-on-error",
                    "--no-owner",
                    `--dbname=${libpq}`,
                    join(folder, "database.dump"),
                ],
                { env: { ...process.env, PGPASSWORD: pgPassword } },
            );
            restored = new PrismaClient({
                datasources: { db: { url: target.toString() } },
            });
            assert.deepEqual(await tableCounts(restored), countsBefore);
            assert.equal(
                (await restored.user.aggregate({ _sum: { balance: true } }))
                    ._sum.balance,
                2400,
            );
            assert.equal(
                (
                    await restored.balanceEntry.aggregate({
                        _sum: { amountMinor: true },
                    })
                )._sum.amountMinor,
                2400,
            );
            await checkRestoredApi(
                target,
                folder,
                viewer.email,
                password,
                token,
            );
        } finally {
            await restored?.$disconnect();
            if (createdDatabase)
                await db.$executeRawUnsafe(`DROP DATABASE "${destination}"`);
            await test.stop();
            storage.close();
            await rm(folder, { recursive: true, force: true });
        }
    },
);
