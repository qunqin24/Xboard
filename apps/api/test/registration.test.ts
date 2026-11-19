import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
    adminUserSchema,
    inviteSchema,
    registerCodeResult,
    type Settings,
} from "@xboard/contracts";
import { db } from "../src/db";
import {
    CODE_DAILY_ATTEMPTS,
    CODE_MAX_ATTEMPTS,
    mailboxKey,
} from "../src/modules/auth/registration";
import { SETTING_DEFAULTS } from "../src/modules/site/service";
import { setTestSmtp, startTestApp } from "./helpers";

type Harness = Awaited<ReturnType<typeof startTestApp>>;
const PASSWORD = "registration-pass-1";

describe("registration", () => {
    let t: Harness;
    let admin = "";
    let planId = 0;

    async function configure(patch: Partial<Settings>) {
        const response = await t.call("/admin/settings", {
            method: "PUT",
            cookie: admin,
            body: { ...SETTING_DEFAULTS, ...patch },
        });
        return response;
    }

    async function register(body: Record<string, unknown>) {
        // Every case runs from 127.0.0.1; the per-minute IP limit is not under test.
        await db.rateLimit.deleteMany();
        return t.call("/auth/register", {
            body: { password: PASSWORD, ...body },
        });
    }

    async function requestCode(email: string) {
        await db.rateLimit.deleteMany();
        return t.call("/auth/register/code", { body: { email } });
    }

    /** The code in the newest mail to `email`. */
    async function mailedCode(email: string) {
        const mail = await db.mail.findFirstOrThrow({
            where: { to: email },
            orderBy: { id: "desc" },
        });
        return /验证码：(\d{6})/.exec(mail.text)?.[1];
    }

    before(async () => {
        t = await startTestApp();
        await t.createUser("root@example.test", "root-test-password", {
            role: "admin",
        });
        admin = await t.cookieFor("root@example.test", "root-test-password");
        const plan = await db.plan.create({
            data: {
                name: "Trial",
                transferEnable: 5n * 1024n ** 3n,
                speedLimit: 50,
                deviceLimit: 2,
            },
        });
        planId = plan.id;
    });
    after(async () => {
        await t?.stop();
    });
    beforeEach(async () => {
        await setTestSmtp("127.0.0.1");
        assert.equal((await configure({})).status, 200);
    });

    it("refuses to require email codes without a mail service", async () => {
        await setTestSmtp();
        const response = await configure({ emailCodeRequired: true });
        assert.equal(response.status, 400);
        assert.match(JSON.stringify(await response.json()), /邮件服务/);
    });

    it("creates a verified account from a mailed code", async () => {
        await configure({ emailCodeRequired: true });
        const email = "code@example.test";
        const first = await requestCode(email);
        assert.equal(first.status, 201);
        assert.equal(
            registerCodeResult.parse(await first.json()).retryAfterSeconds,
            60,
        );
        const code = await mailedCode(email);
        assert.ok(code);

        // A repeat inside the cooldown sends nothing and keeps the first code.
        const repeat = await requestCode(email);
        const wait = registerCodeResult.parse(await repeat.json());
        assert.ok(wait.retryAfterSeconds > 0 && wait.retryAfterSeconds <= 60);
        assert.equal(await db.mail.count({ where: { to: email } }), 1);

        assert.equal((await register({ email })).status, 400);
        const wrong = await register({
            email,
            emailCode: code === "000000" ? "111111" : "000000",
        });
        assert.equal(wrong.status, 400);
        assert.match(JSON.stringify(await wrong.json()), /验证码不正确/);
        assert.equal(await db.user.count({ where: { email } }), 0);

        const created = await register({ email, emailCode: code });
        assert.equal(created.status, 201);
        const user = await db.user.findUniqueOrThrow({ where: { email } });
        assert.ok(user.verifiedAt);
        assert.equal(await db.registerCode.count({ where: { email } }), 0);
    });

    it("voids a code after too many wrong guesses or when it expires", async () => {
        await configure({ emailCodeRequired: true });
        const email = "guess@example.test";
        await requestCode(email);
        const code = (await mailedCode(email))!;
        const wrong = code === "000000" ? "111111" : "000000";
        for (let i = 0; i < CODE_MAX_ATTEMPTS; i++)
            assert.equal(
                (await register({ email, emailCode: wrong })).status,
                400,
            );
        const late = await register({ email, emailCode: code });
        assert.equal(late.status, 400);
        assert.match(JSON.stringify(await late.json()), /已过期/);

        // A new code (after the cooldown) works again; an expired one does not.
        await db.registerCode.update({
            where: { email },
            data: { sentAt: new Date(Date.now() - 61_000) },
        });
        await requestCode(email);
        const fresh = (await mailedCode(email))!;
        await db.registerCode.update({
            where: { email },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        assert.equal((await register({ email, emailCode: fresh })).status, 400);
        assert.equal(await db.user.count({ where: { email } }), 0);
    });

    it("caps wrong guesses per mailbox per day even when new codes are requested", async () => {
        await configure({ emailCodeRequired: true });
        const email = "slow.guess@gmail.com";
        const attempt = (code: string) =>
            t.call("/auth/register", {
                body: { email, password: PASSWORD, emailCode: code },
            });
        await db.rateLimit.deleteMany();
        let wrongCount = 0;
        let blocked = false;
        for (let round = 0; round < 6 && !blocked; round++) {
            // Each fresh code resets the per-code counter, not the daily one.
            await db.registerCode.deleteMany({ where: { email } });
            await t.call("/auth/register/code", { body: { email } });
            const code = (await mailedCode(email))!;
            const wrong = code === "000000" ? "111111" : "000000";
            for (let i = 0; i < CODE_MAX_ATTEMPTS && !blocked; i++) {
                // The per-IP limit is not under test.
                await db.rateLimit.deleteMany({
                    where: { key: { startsWith: "ip:" } },
                });
                const response = await attempt(wrong);
                if (response.status === 429) blocked = true;
                else {
                    assert.equal(response.status, 400);
                    wrongCount++;
                }
            }
        }
        assert.ok(blocked);
        assert.equal(wrongCount, CODE_DAILY_ATTEMPTS);
        // An alias of the same Gmail mailbox shares the cap; the right code is refused too.
        await db.registerCode.deleteMany({ where: { email } });
        await t.call("/auth/register/code", { body: { email } });
        const code = (await mailedCode(email))!;
        await db.rateLimit.deleteMany({
            where: { key: { startsWith: "ip:" } },
        });
        const alias = await t.call("/auth/register", {
            body: {
                email: "slowguess+x@gmail.com",
                password: PASSWORD,
                emailCode: code,
            },
        });
        assert.equal(alias.status, 429);
        assert.equal(await db.user.count({ where: { email } }), 0);
    });

    it("mails a notice, not a code, to an address that already has an account", async () => {
        await configure({ emailCodeRequired: true });
        await t.createUser("taken@example.test", PASSWORD);
        const response = await requestCode("taken@example.test");
        assert.equal(response.status, 201);
        assert.equal(await mailedCode("taken@example.test"), undefined);
        const mail = await db.mail.findFirstOrThrow({
            where: { to: "taken@example.test" },
        });
        assert.match(mail.text, /已注册/);
    });

    it("needs a valid invite code when invite-only", async () => {
        await t.createUser("inviter@example.test", PASSWORD);
        const inviterCookie = await t.cookieFor(
            "inviter@example.test",
            PASSWORD,
        );
        const invite = inviteSchema.parse(
            await (
                await t.call("/account/invite", { cookie: inviterCookie })
            ).json(),
        );
        assert.match(invite.code, /^[2-9A-HJKMNP-Z]{8}$/);
        assert.equal(invite.invitedCount, 0);

        await configure({ inviteOnly: true });
        const missing = await register({ email: "nocode@example.test" });
        assert.equal(missing.status, 403);
        const invalid = await register({
            email: "badcode@example.test",
            inviteCode: "ZZZZZZZZ",
        });
        assert.equal(invalid.status, 400);

        const created = await register({
            email: "invitee@example.test",
            inviteCode: invite.code.toLowerCase(),
        });
        assert.equal(created.status, 201);
        const after = inviteSchema.parse(
            await (
                await t.call("/account/invite", { cookie: inviterCookie })
            ).json(),
        );
        assert.equal(after.code, invite.code);
        assert.equal(after.invitedCount, 1);
        assert.deepEqual(
            after.recent.map((r) => r.email),
            ["in***@example.test"],
        );

        const invitee = await db.user.findUniqueOrThrow({
            where: { email: "invitee@example.test" },
        });
        const detail = adminUserSchema.parse(
            await (
                await t.call(`/admin/users/${invitee.id}`, { cookie: admin })
            ).json(),
        );
        assert.equal(detail.invitedBy, "inviter@example.test");

        // A new code retires the old one.
        const reset = inviteSchema.parse(
            await (
                await t.call("/account/invite/reset", {
                    method: "POST",
                    cookie: inviterCookie,
                })
            ).json(),
        );
        assert.notEqual(reset.code, invite.code);
        assert.equal(
            (
                await register({
                    email: "late@example.test",
                    inviteCode: invite.code,
                })
            ).status,
            400,
        );

        // A banned inviter's code no longer works.
        await db.user.update({
            where: { email: "inviter@example.test" },
            data: { banned: true },
        });
        assert.equal(
            (
                await register({
                    email: "late2@example.test",
                    inviteCode: reset.code,
                })
            ).status,
            400,
        );
    });

    it("rejects an unknown invite code even when invites are optional", async () => {
        const response = await register({
            email: "optional@example.test",
            inviteCode: "ABCDEFGH",
        });
        assert.equal(response.status, 400);
        assert.equal(
            (await register({ email: "optional@example.test" })).status,
            201,
        );
    });

    it("applies the email domain allow and deny lists", async () => {
        assert.equal(
            (await configure({ emailDomainMode: "allow", emailDomains: [] }))
                .status,
            400,
        );
        assert.equal(
            (
                await configure({
                    emailDomainMode: "deny",
                    emailDomains: ["@Spam.Example", "*.junk.example"],
                })
            ).status,
            200,
        );
        const stored = (await (
            await t.call("/admin/settings", { cookie: admin })
        ).json()) as Settings;
        assert.deepEqual(stored.emailDomains, ["spam.example", "junk.example"]);
        assert.equal((await register({ email: "a@spam.example" })).status, 400);
        assert.equal(
            (await register({ email: "a@mail.junk.example" })).status,
            400,
        );
        assert.equal((await register({ email: "a@ok.example" })).status, 201);

        await configure({
            emailDomainMode: "allow",
            emailDomains: ["school.example"],
        });
        const outside = await register({ email: "b@ok.example" });
        assert.equal(outside.status, 400);
        assert.match(JSON.stringify(await outside.json()), /school\.example/);
        assert.equal(
            (await register({ email: "b@school.example" })).status,
            201,
        );
    });

    it("treats Gmail aliases as one mailbox when asked", async () => {
        assert.equal(mailboxKey("j.doe+news@googlemail.com"), "jdoe@gmail.com");
        assert.equal(mailboxKey("j.doe+x@example.com"), "j.doe+x@example.com");
        assert.equal(
            (await register({ email: "jane.roe@gmail.com" })).status,
            201,
        );
        assert.equal(
            (await register({ email: "janeroe+1@gmail.com" })).status,
            201,
        );
        await configure({ gmailAliasCheck: true });
        assert.equal(
            (await register({ email: "j.a.n.e.roe+2@googlemail.com" })).status,
            409,
        );
    });

    it("caps accounts per network per 24 hours", async () => {
        await configure({ registerIpDailyLimit: 2 });
        // Earlier tests registered from this address too; start the window clean.
        await db.user.updateMany({ data: { registerIp: null } });
        assert.equal(
            (await register({ email: "ip1@example.test" })).status,
            201,
        );
        assert.equal(
            (await register({ email: "ip2@example.test" })).status,
            201,
        );
        const third = await register({ email: "ip3@example.test" });
        assert.equal(third.status, 429);
        assert.match(JSON.stringify(await third.json()), /24 小时/);
        // Accounts older than a day no longer count.
        await db.user.updateMany({
            where: { email: { in: ["ip1@example.test", "ip2@example.test"] } },
            data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
        });
        assert.equal(
            (await register({ email: "ip3@example.test" })).status,
            201,
        );
    });

    it("grants the trial plan at sign-up", async () => {
        const deleted = await db.plan.create({
            data: { name: "Gone", transferEnable: 1n, deletedAt: new Date() },
        });
        assert.equal(
            (await configure({ trialPlanId: deleted.id })).status,
            400,
        );
        assert.equal(
            (await configure({ trialPlanId: planId, trialDays: 3 })).status,
            200,
        );
        const before = Date.now();
        assert.equal(
            (await register({ email: "trial@example.test" })).status,
            201,
        );
        const user = await db.user.findUniqueOrThrow({
            where: { email: "trial@example.test" },
        });
        assert.equal(user.planId, planId);
        assert.equal(user.transferEnable, 5n * 1024n ** 3n);
        assert.equal(user.speedLimit, 50);
        assert.equal(user.deviceLimit, 2);
        const days = (user.expiredAt!.getTime() - before) / 86_400_000;
        assert.ok(days > 2.99 && days < 3.01, String(days));
        assert.equal(
            await db.audit.count({
                where: { action: "trial.grant", actorId: user.id },
            }),
            1,
        );
    });

    it("requires accepting the terms once they are listed", async () => {
        assert.equal(
            (await configure({ termsUrl: "javascript:alert(1)" })).status,
            400,
        );
        await configure({ termsUrl: "https://example.test/terms" });
        const site = (await (await t.call("/site")).json()) as Record<
            string,
            unknown
        >;
        assert.equal(site.termsUrl, "https://example.test/terms");
        const refused = await register({ email: "terms@example.test" });
        assert.equal(refused.status, 400);
        assert.equal(
            (
                await register({
                    email: "terms@example.test",
                    acceptTerms: true,
                })
            ).status,
            201,
        );
        const user = await db.user.findUniqueOrThrow({
            where: { email: "terms@example.test" },
        });
        assert.ok(user.termsAcceptedAt);
    });
});
