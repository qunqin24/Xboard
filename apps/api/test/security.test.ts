import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
    deviceSessionSchema,
    errorSchema,
    recoveryCodesSchema,
    totpSetupResult,
} from "@xboard/contracts";
import { db } from "../src/db";
import { login as serviceLogin } from "../src/modules/auth/service";
import { verifyTotp } from "../src/modules/auth/totp";
import { startTestApp } from "./helpers";

const PASSWORD = "device-test-password";

it("matches the RFC 6238 SHA-1 vector and rejects replay", () => {
    const secret = Buffer.from("12345678901234567890");
    assert.equal(verifyTotp(secret, "287082", null, 59_000), 1n);
    assert.equal(verifyTotp(secret, "287082", 1n, 59_000), null);
    assert.equal(verifyTotp(secret, "287082", null, 120_000), null);
});

function codeAt(secret: string, step: bigint) {
    const bits = [...secret]
        .map((letter) =>
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
                .indexOf(letter)
                .toString(2)
                .padStart(5, "0"),
        )
        .join("");
    const key = Buffer.from(
        bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)),
    );
    const timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64BE(step);
    const hash = createHmac("sha1", key).update(timestamp).digest();
    return ((hash.readUInt32BE(hash.at(-1)! & 15) & 0x7fff_ffff) % 1_000_000)
        .toString()
        .padStart(6, "0");
}

/** Sign in through the service, below the per-IP limiter; returns the HTTP status. */
async function statusOf(email: string, twoFactorCode: string) {
    try {
        await serviceLogin(email, PASSWORD, { twoFactorCode });
        return 200;
    } catch (error) {
        return (error as { status: number }).status;
    }
}

describe("account security", () => {
    let app: Awaited<ReturnType<typeof startTestApp>>;
    before(async () => {
        app = await startTestApp();
    });
    after(async () => {
        await app?.stop();
    });

    const list = async (cookie: string) =>
        deviceSessionSchema
            .array()
            .parse(
                await (await app.call("/account/sessions", { cookie })).json(),
            );

    it("lists only the owner's sessions and revokes a selected device or all others", async () => {
        const email = "devices@example.test";
        await app.createUser(email, PASSWORD);
        const primary = await app.cookieFor(email, PASSWORD);
        const login = await app.call("/auth/login", {
            body: { email, password: PASSWORD },
            headers: { "user-agent": "Secondary device fixture" },
        });
        assert.equal(login.status, 200);
        const secondary = login.headers.get("set-cookie")!.split(";")[0]!;
        const sessions = await list(primary);
        assert.equal(sessions.length, 2);
        const current = sessions.find((session) => session.current)!;
        const other = sessions.find((session) => !session.current)!;
        assert.equal(other.userAgent, "Secondary device fixture");
        await app.createUser("other-owner@example.test", PASSWORD);
        const outsider = await app.cookieFor(
            "other-owner@example.test",
            PASSWORD,
        );
        const revoke = (id: string) =>
            app.call(`/account/sessions/${id}`, {
                cookie: primary,
                method: "DELETE",
            });
        assert.equal((await revoke((await list(outsider))[0]!.id)).status, 404);
        assert.equal((await revoke(current.id)).status, 400);
        assert.equal((await revoke(other.id)).status, 200);
        assert.equal(
            (await app.call("/account", { cookie: secondary })).status,
            401,
        );
        const replacement = await app.cookieFor(email, PASSWORD);
        const all = await app.call("/account/sessions/revoke-others", {
            cookie: primary,
            method: "POST",
        });
        assert.deepEqual(await all.json(), { revoked: 1 });
        assert.equal(
            (await app.call("/account", { cookie: replacement })).status,
            401,
        );
        assert.equal(
            (await app.call("/account", { cookie: primary })).status,
            200,
        );
    });

    it("binds TOTP setup to a session and consumes each proof only once", async () => {
        const email = "two-factor@example.test";
        const user = await app.createUser(email, PASSWORD);
        const primary = await app.cookieFor(email, PASSWORD);
        const other = await app.cookieFor(email, PASSWORD);
        const setup = totpSetupResult.parse(
            await (
                await app.call("/account/totp/setup", {
                    cookie: primary,
                    body: { password: PASSWORD },
                })
            ).json(),
        );
        const step = BigInt(Math.floor(Date.now() / 30_000));
        const code = codeAt(setup.secret, step);
        const enable = (cookie: string) =>
            app.call("/account/totp/enable", { cookie, body: { code } });
        assert.equal((await enable(other)).status, 400);
        const recovery = recoveryCodesSchema.parse(
            await (await enable(primary)).json(),
        );
        assert.equal(recovery.codes.length, 8);
        assert.equal(
            (await app.call("/account", { cookie: other })).status,
            401,
        );
        const saved = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.ok(saved.totpSecret && !saved.totpSecret.includes(setup.secret));
        assert.ok(!saved.totpRecoveryHashes.includes(recovery.codes[0]!));

        await db.rateLimit.deleteMany();
        const login = (twoFactorCode?: string) =>
            app.call("/auth/login", {
                body: { email, password: PASSWORD, twoFactorCode },
            });
        const required = await login();
        assert.equal(required.status, 401);
        assert.equal(required.headers.get("set-cookie"), null);
        assert.equal(
            errorSchema.parse(await required.json()).error.code,
            "two_factor_required",
        );
        const next = codeAt(setup.secret, step + 1n);
        const concurrent = await Promise.all([login(next), login(next)]);
        assert.deepEqual(
            concurrent.map((response) => response.status).sort(),
            [200, 401],
        );
        assert.equal((await login(recovery.codes[0]!)).status, 200);
        assert.equal((await login(recovery.codes[0]!)).status, 401);
        await db.rateLimit.deleteMany();
        const rotated = recoveryCodesSchema.parse(
            await (
                await app.call("/account/totp/recovery-codes", {
                    cookie: primary,
                    body: { password: PASSWORD, code: recovery.codes[1] },
                })
            ).json(),
        );
        assert.equal((await login(recovery.codes[2]!)).status, 401);
        assert.equal(
            (
                await app.call("/account/totp/disable", {
                    cookie: primary,
                    body: { password: PASSWORD, code: rotated.codes[0] },
                })
            ).status,
            200,
        );
        assert.equal((await login()).status, 200);
    });

    /** A user with two-factor on; returns the secret and a login helper. */
    async function twoFactorUser(email: string) {
        const user = await app.createUser(email, PASSWORD);
        const cookie = await app.cookieFor(email, PASSWORD);
        const setup = totpSetupResult.parse(
            await (
                await app.call("/account/totp/setup", {
                    cookie,
                    body: { password: PASSWORD },
                })
            ).json(),
        );
        const step = BigInt(Math.floor(Date.now() / 30_000));
        const enable = await app.call("/account/totp/enable", {
            cookie,
            body: { code: codeAt(setup.secret, step) },
        });
        assert.equal(enable.status, 201);
        const recovery = recoveryCodesSchema.parse(await enable.json());
        await db.rateLimit.deleteMany();
        const login = (twoFactorCode: string) =>
            app.call("/auth/login", {
                body: { email, password: PASSWORD, twoFactorCode },
            });
        return { user, cookie, setup, step, recovery, login };
    }

    it("returns an otpauth URI for the QR code", async () => {
        const email = "otpauth@example.test";
        await app.createUser(email, PASSWORD);
        const cookie = await app.cookieFor(email, PASSWORD);
        const setup = totpSetupResult.parse(
            await (
                await app.call("/account/totp/setup", {
                    cookie,
                    body: { password: PASSWORD },
                })
            ).json(),
        );
        const uri = new URL(setup.uri);
        assert.equal(uri.protocol, "otpauth:");
        assert.equal(uri.host, "totp");
        assert.equal(
            decodeURIComponent(uri.pathname),
            `/${uri.searchParams.get("issuer")}:${email}`,
        );
        assert.equal(uri.searchParams.get("secret"), setup.secret);
        assert.equal(uri.searchParams.get("digits"), "6");
        assert.equal(uri.searchParams.get("period"), "30");
    });

    it("limits wrong second-factor guesses per user, even when sent in parallel", async () => {
        const email = "guess-limit@example.test";
        const { setup, step, user } = await twoFactorUser(email);
        const statuses = await Promise.all(
            Array.from({ length: 9 }, (_, i) =>
                statusOf(email, String(100_000 + i * 7)),
            ),
        );
        assert.equal(statuses.filter((status) => status === 401).length, 5);
        assert.equal(statuses.filter((status) => status === 429).length, 4);
        // The password counter is separate and was never touched.
        assert.equal(
            await db.rateLimit.count({ where: { key: `login-fail:${email}` } }),
            0,
        );
        // Blocked: even the right code is refused until the lock ends.
        const right = codeAt(setup.secret, step + 1n);
        assert.equal(await statusOf(email, right), 429);
        await db.rateLimit.deleteMany({
            where: { key: `2fa-fail:${user.id}` },
        });
        assert.equal(await statusOf(email, right), 200);
    });

    it("reports a wrong code with the generic two-factor error", async () => {
        const email = "guess-generic@example.test";
        const { login } = await twoFactorUser(email);
        const response = await login("123456");
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("set-cookie"), null);
        assert.equal(
            errorSchema.parse(await response.json()).error.code,
            "two_factor_invalid",
        );
    });

    it("refunds correct codes and blocks for a day after repeated lock-outs", async () => {
        const email = "guess-daily@example.test";
        const { recovery, user } = await twoFactorUser(email);
        // A correct code gives its hit back, so normal sign-ins never add up.
        for (const code of recovery.codes.slice(0, 3))
            assert.equal(await statusOf(email, code), 200);
        const rows = await db.rateLimit.findMany({
            where: { key: { startsWith: "2fa-fail" } },
        });
        assert.ok(rows.every((row) => row.hits === 0));
        await db.rateLimit.upsert({
            where: { key: `2fa-fail-day:${user.id}` },
            create: {
                key: `2fa-fail-day:${user.id}`,
                hits: 15,
                expiresAt: new Date(Date.now() + 3_600_000),
            },
            update: { hits: 15 },
        });
        assert.equal(await statusOf(email, "123456"), 429);
        assert.equal(await statusOf(email, recovery.codes[4]!), 429);
    });

    it("applies the same limit to disabling and recovery-code rotation", async () => {
        const email = "proof-limit@example.test";
        const { cookie, setup, step, recovery, user } =
            await twoFactorUser(email);
        const attempt = (code: string, path = "disable") =>
            app.call(`/account/totp/${path}`, {
                cookie,
                body: { password: PASSWORD, code },
            });
        const wrong = await Promise.all(
            Array.from({ length: 8 }, (_, i) =>
                attempt(String(200_000 + i * 11)),
            ),
        );
        const statuses = wrong.map((response) => response.status);
        assert.equal(statuses.filter((status) => status === 400).length, 5);
        assert.equal(statuses.filter((status) => status === 429).length, 3);
        assert.equal(
            (await attempt(recovery.codes[0]!, "recovery-codes")).status,
            429,
        );
        assert.ok(
            (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
                .totpSecret,
        );
        await db.rateLimit.deleteMany();
        assert.equal(
            (await attempt(codeAt(setup.secret, step + 1n))).status,
            200,
        );
    });

    it("lets an admin reset a user's two-factor, signing the user out", async () => {
        const adminEmail = "reset-admin@example.test";
        await app.createUser(adminEmail, PASSWORD, { role: "admin" });
        const admin = await app.cookieFor(adminEmail, PASSWORD);
        const { user, cookie, login } = await twoFactorUser(
            "reset-target@example.test",
        );
        // Leave failures on record: a reset clears them.
        assert.equal((await login("111111")).status, 401);
        const path = `/admin/users/${user.id}/two-factor/reset`;
        assert.equal(
            (await app.call(path, { cookie, method: "POST" })).status,
            403,
        );
        const reset = await app.call(path, { cookie: admin, method: "POST" });
        assert.equal(reset.status, 201);
        const saved = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(saved.totpSecret, null);
        assert.deepEqual(saved.totpRecoveryHashes, []);
        assert.equal((await app.call("/account", { cookie })).status, 401);
        assert.equal(
            await db.rateLimit.count({
                where: { key: { startsWith: `2fa-fail:${user.id}` } },
            }),
            0,
        );
        const entry = await db.audit.findFirstOrThrow({
            where: { action: "user.two_factor_reset", target: String(user.id) },
        });
        assert.equal(
            entry.actorId,
            (await db.user.findUniqueOrThrow({ where: { email: adminEmail } }))
                .id,
        );
        // Password alone now signs in; a repeat reset has nothing to remove.
        assert.equal(
            (
                await app.call("/auth/login", {
                    body: { email: user.email, password: PASSWORD },
                })
            ).status,
            200,
        );
        assert.equal(
            (await app.call(path, { cookie: admin, method: "POST" })).status,
            409,
        );
        // Admin accounts are not reset through this endpoint.
        const other = await app.createUser(
            "reset-admin2@example.test",
            PASSWORD,
            {
                role: "admin",
                totpSecret: "x",
            },
        );
        assert.equal(
            (
                await app.call(`/admin/users/${other.id}/two-factor/reset`, {
                    cookie: admin,
                    method: "POST",
                })
            ).status,
            400,
        );
    });
});
