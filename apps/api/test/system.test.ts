import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import {
    applicationKey,
    installationSecret,
    secretPath,
} from "../src/modules/system/secrets";
import { appDirectory } from "../src/config";
import { db } from "../src/db";
import {
    ApplicationKeyError,
    prepareApplicationKey,
} from "../src/modules/system/application-key";
import { getSmtpConfig } from "../src/modules/system/settings";
import { makeRecoveryCodes, sealSecret } from "../src/modules/auth/totp";
import { startTestApp } from "./helpers";

describe("system provisioning and settings", () => {
    let test: Awaited<ReturnType<typeof startTestApp>>;
    let cookie: string;
    const email = "setup-admin@example.test";
    const password = "setup-fixture-password";
    before(async () => {
        test = await startTestApp();
    });
    after(async () => test?.stop());

    it("generates a persistent application key and accepts the installation code once", async () => {
        const key = applicationKey();
        assert.equal((await stat(secretPath("app.key"))).mode & 0o777, 0o600);
        assert.equal(applicationKey(), key);
        assert.equal((await test.call("/setup")).status, 200);
        const code = installationSecret("setup.code");
        const make = (code: string) =>
            test.call("/setup", { body: { email, password, code } });
        assert.equal((await make("z".repeat(43))).status, 401);
        const results = await Promise.all([make(code), make(code)]);
        assert.deepEqual(
            results.map((response) => response.status).sort(),
            [201, 404],
        );
        assert.equal(await db.user.count({ where: { role: "admin" } }), 1);
        assert.equal((await test.call("/setup")).status, 404);
        await assert.rejects(stat(secretPath("setup.code")), {
            code: "ENOENT",
        });
        cookie = await test.cookieFor(email, password);
    });

    it("persists encrypted mail settings and hides them in responses and audit", async () => {
        const created = await test.call("/admin/ops-tokens", {
            cookie,
            body: {
                name: "settings test",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
        });
        assert.equal(created.status, 201);
        const { id, token } = (await created.json()) as {
            id: string;
            token: string;
        };
        const smtpPassword = "smtp-fixture-private-value";
        const headers = {
            authorization: `Bearer ${token}`,
            "idempotency-key": randomUUID(),
        };
        const body = {
            smtpHost: "localhost",
            smtpPort: 1025,
            mailFrom: "ops@example.test",
            smtpUser: "test",
            smtpPassword,
        };
        const configured = await test.call("/ops/v1/settings/mail", {
            headers,
            method: "PUT",
            body,
        });
        assert.equal(configured.status, 200, await configured.clone().text());
        const output = JSON.parse(await configured.text());
        assert.equal(output.smtpPasswordSet, true);
        assert.equal(output.smtpPassword, undefined);
        assert.equal((await getSmtpConfig())?.password, smtpPassword);
        const secret = await db.setting.findUniqueOrThrow({
            where: { key: "smtpPassword" },
        });
        assert.notEqual(secret.value, smtpPassword);
        const audit = await test.call(`/admin/audit?opsTokenId=${id}`, {
            cookie,
        });
        const serialized = await audit.text();
        assert.ok(
            !serialized.includes(smtpPassword) &&
                !serialized.includes(String(secret.value)),
        );
        assert.match(serialized, /privateFields/);
        const queued = await test.call("/admin/settings/mail/test", {
            cookie,
            body: { to: email },
        });
        assert.equal(queued.status, 201);
        assert.equal(await db.mail.count({ where: { to: email } }), 1);
        assert.equal(
            (
                await test.call("/admin/settings/mail", {
                    cookie,
                    method: "PUT",
                    body: { ...body, smtpPassword: null },
                })
            ).status,
            200,
        );
        assert.equal((await getSmtpConfig())?.password, undefined);
    });

    it("asks for the secret again before sending it to a different server", async () => {
        const save = (group: string, body: Record<string, unknown>) =>
            test.call(`/admin/settings/${group}`, {
                cookie,
                method: "PUT",
                body,
            });
        const mail = {
            smtpHost: "smtp.example.test",
            smtpPort: 587,
            smtpUser: "panel",
            mailFrom: "panel@example.test",
        };
        assert.equal(
            (await save("mail", { ...mail, smtpPassword: "first-secret" }))
                .status,
            200,
        );
        // Another server, port or user without the password: refused, stored
        // password untouched.
        for (const moved of [
            { smtpHost: "smtp.attacker.test" },
            { smtpPort: 2525 },
            { smtpUser: "other" },
        ]) {
            const response = await save("mail", { ...mail, ...moved });
            assert.equal(response.status, 400);
            assert.match(await response.text(), /重新填写密码/);
        }
        assert.equal((await getSmtpConfig())?.host, "smtp.example.test");
        // Unrelated fields still save without the password.
        assert.equal(
            (await save("mail", { ...mail, mailFrom: "ops@example.test" }))
                .status,
            200,
        );
        assert.equal((await getSmtpConfig())?.password, "first-secret");
        // Moving with the password re-entered is fine.
        assert.equal(
            (
                await save("mail", {
                    ...mail,
                    smtpHost: "smtp2.example.test",
                    smtpPassword: "second-secret",
                })
            ).status,
            200,
        );
        assert.equal((await getSmtpConfig())?.password, "second-secret");

        const backup = {
            backupStorage: "r2",
            backupR2AccountId: "a".repeat(32),
            backupBucket: "panel-backups",
            backupAccessKeyId: "access-key",
        };
        assert.equal(
            (
                await save("backup", {
                    ...backup,
                    backupSecretAccessKey: "backup-secret",
                })
            ).status,
            200,
        );
        for (const moved of [
            {
                backupStorage: "s3",
                backupS3Endpoint: "https://s3.attacker.test",
            },
            { backupR2AccountId: "b".repeat(32) },
            { backupR2Jurisdiction: "eu" },
            { backupAccessKeyId: "other-key" },
        ])
            assert.equal(
                (await save("backup", { ...backup, ...moved })).status,
                400,
            );
        assert.equal(
            (await save("backup", { ...backup, backupPrefix: "panel/" }))
                .status,
            200,
        );

        const captcha = {
            captchaProvider: "turnstile",
            captchaSiteKey: "site-key",
            captchaOnLogin: false,
        };
        assert.equal(
            (
                await save("captcha", {
                    ...captcha,
                    captchaSecretKey: "captcha-secret",
                })
            ).status,
            200,
        );
        assert.equal(
            (await save("captcha", { ...captcha, captchaProvider: "hcaptcha" }))
                .status,
            400,
        );
        // Switching the feature off sends the secret nowhere.
        assert.equal(
            (await save("captcha", { ...captcha, captchaProvider: "off" }))
                .status,
            200,
        );
    });

    it("reauthenticates before exporting the application key and redeems a recovery code once", async () => {
        const path = "/admin/settings/application-key";
        const user = await db.user.findUniqueOrThrow({ where: { email } });
        const { codes, hashes } = makeRecoveryCodes();
        await db.user.update({
            where: { id: user.id },
            data: {
                totpSecret: sealSecret(user.id, Buffer.alloc(20, 1)),
                totpRecoveryHashes: hashes,
            },
        });
        assert.equal(
            (await test.call(path, { cookie, body: { password: "wrong" } }))
                .status,
            401,
        );
        assert.equal(
            (await test.call(path, { cookie, body: { password } })).status,
            401,
        );
        const body = { password, twoFactorCode: codes[0] };
        const response = await test.call(path, { cookie, body });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { appKey: applicationKey() });
        assert.equal((await test.call(path, { cookie, body })).status, 401);
        assert.equal(
            await db.audit.count({
                where: { action: "settings.application_key_export" },
            }),
            1,
        );
    });

    it("refuses a missing or foreign application key once data is sealed, and never creates one at runtime", async () => {
        // The earlier tests sealed a two-step secret and the mail password.
        const path = secretPath("app.key");
        const original = await readFile(path, "utf8");
        await rm(path);
        assert.throws(() => applicationKey(), /missing/);
        await assert.rejects(prepareApplicationKey(), ApplicationKeyError);
        await assert.rejects(stat(path), { code: "ENOENT" });

        // A valid key from another installation is caught by the key check.
        await writeFile(path, Buffer.alloc(32, 7).toString("base64url"), {
            mode: 0o600,
        });
        await assert.rejects(prepareApplicationKey(), ApplicationKeyError);

        await writeFile(path, original, { mode: 0o600 });
        await prepareApplicationKey();

        // The reset script is the way out when the key is truly lost.
        await rm(path);
        const env = { ...process.env };
        const refused = spawnSync(
            "pnpm",
            ["exec", "tsx", "scripts/reset-app-key.ts"],
            { cwd: appDirectory, env, stdio: "pipe" },
        );
        assert.equal(refused.status, 2, refused.stderr.toString());
        await assert.rejects(stat(path), { code: "ENOENT" });
        const reset = spawnSync(
            "pnpm",
            ["exec", "tsx", "scripts/reset-app-key.ts", "--confirm"],
            { cwd: appDirectory, env, stdio: "pipe" },
        );
        assert.equal(reset.status, 0, reset.stderr.toString());
        assert.notEqual(await readFile(path, "utf8"), original);
        await prepareApplicationKey();
        assert.equal(
            await db.user.count({ where: { totpSecret: { not: null } } }),
            0,
        );
        assert.equal(
            await db.setting.count({ where: { key: "smtpPassword" } }),
            0,
        );
        assert.equal(
            await db.audit.count({ where: { action: "system.app_key_reset" } }),
            1,
        );
    });
});
