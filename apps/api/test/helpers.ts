import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createApp, type App } from "../src/app";
import { appDirectory } from "../src/config";
import { closeDb, db } from "../src/db";
import { hashPassword } from "../src/modules/auth/password";
import { login } from "../src/modules/auth/service";

export const ORIGIN = "http://127.0.0.1:5173";

/**
 * Migrate a fresh, randomly named schema and serve the app on a random port.
 * Call `stop()` in after(): it drops only that schema.
 */
export async function startTestApp() {
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    process.env.NODE_ENV = "test";
    process.env.APP_ORIGIN = ORIGIN;
    const url = new URL(
        process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
    );
    url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString();
    const migrate = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
        cwd: appDirectory,
        env: process.env,
        stdio: "pipe",
    });
    assert.equal(migrate.status, 0, migrate.stderr?.toString());
    const previousDataDir = process.env.APP_DATA_DIR;
    const dataDir = await mkdtemp(join(tmpdir(), "xboard-test-"));
    process.env.APP_DATA_DIR = dataDir;
    const app: App = createApp({ logging: false });
    await app.listen(0, "127.0.0.1");
    const baseUrl = app.getUrl();

    /** `call("/account", { cookie })`; JSON bodies; Origin is always set. */
    async function call(
        path: string,
        options: {
            method?: string;
            body?: unknown;
            cookie?: string;
            headers?: Record<string, string>;
        } = {},
    ) {
        return fetch(`${baseUrl}/api${path}`, {
            method:
                options.method ?? (options.body === undefined ? "GET" : "POST"),
            headers: {
                origin: ORIGIN,
                ...(options.body === undefined
                    ? {}
                    : { "content-type": "application/json" }),
                ...(options.cookie ? { cookie: options.cookie } : {}),
                ...options.headers,
            },
            body:
                options.body === undefined
                    ? undefined
                    : JSON.stringify(options.body),
        });
    }

    async function createUser(
        email: string,
        password: string,
        data: Record<string, unknown> = {},
    ) {
        return db.user.create({
            data: { email, password: await hashPassword(password), ...data },
        });
    }

    async function cookieFor(email: string, password: string) {
        return `xboard_session=${(await login(email, password)).token}`;
    }

    async function stop() {
        await app.close();
        await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await closeDb();
        await rm(dataDir, { recursive: true, force: true });
        if (previousDataDir === undefined) delete process.env.APP_DATA_DIR;
        else process.env.APP_DATA_DIR = previousDataDir;
    }

    return { app, baseUrl, call, createUser, cookieFor, stop };
}

export async function setTestSmtp(host = "", port = 587) {
    for (const [key, value] of Object.entries({
        smtpHost: host,
        smtpPort: port,
        mailFrom: "Xboard <noreply@example.test>",
    }))
        await db.setting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
        });
}
