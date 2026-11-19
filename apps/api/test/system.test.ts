import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import {
    applicationKey,
    installationSecret,
    secretPath,
} from "../src/modules/system/secrets";
import { db } from "../src/db";
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
});
