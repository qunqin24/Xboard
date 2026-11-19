import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { db } from "../src/db";
import { checkOfflineNodes } from "../src/jobs/node-monitor";
import { captchaVerifiers } from "../src/modules/auth/captcha";
import { epaySign } from "../src/modules/payments/gateways";
import { flushTelegram } from "../src/modules/telegram/service";
import { ORIGIN, setTestSmtp, startTestApp } from "./helpers";

const password = "p1-feature-fixture-password";
const mailDomain = "@p1.example.test";
const gatewayBase = {
    enabled: true,
    sortOrder: 0,
    icon: null,
    feePercentBasisPoints: 250,
    feeFixedMinor: 7,
};
const nextRequest = () => randomUUID();
describe("P1 integrations", () => {
    let test: Awaited<ReturnType<typeof startTestApp>>;
    let admin: string;
    let planId: number;
    before(async () => {
        process.env.TRUSTED_PROXY = "127.0.0.1";
        test = await startTestApp();
        await test.createUser("owner" + mailDomain, password, {
            role: "admin",
        });
        admin = await test.cookieFor("owner" + mailDomain, password);
        planId = (
            await db.plan.create({
                data: {
                    name: "Fixture",
                    published: true,
                    transferEnable: 100_000n,
                    prices: {
                        create: { period: "monthly", amountMinor: 2000 },
                    },
                },
            })
        ).id;
        await setTestSmtp("localhost");
    });
    after(async () => test?.stop());

    async function buyer(name: string, data: Record<string, unknown> = {}) {
        const row = await test.createUser(name + mailDomain, password, data);
        return { row, cookie: await test.cookieFor(row.email, password) };
    }
    async function order(cookie: string) {
        const response = await test.call("/orders", {
            cookie,
            body: { requestId: nextRequest(), planId, period: "monthly" },
        });
        assert.equal(response.status, 201, await response.clone().text());
        return (await response.json()) as { id: string };
    }
    async function adminPut(path: string, body: unknown) {
        const response = await test.call(path, {
            cookie: admin,
            method: "PUT",
            body,
        });
        assert.equal(response.status, 200, await response.clone().text());
        return (await response.json()) as Record<string, unknown>;
    }
    async function adminPutGateway(id: number, body: unknown) {
        const response = await test.call(`/admin/payment-gateways/${id}`, {
            cookie: admin,
            method: "PUT",
            body,
        });
        assert.equal(response.status, 200, await response.clone().text());
    }
    async function gateway(body: unknown) {
        const response = await test.call("/admin/payment-gateways", {
            cookie: admin,
            body,
        });
        assert.equal(response.status, 201, await response.clone().text());
        const result = (await response.json()) as {
            id: number;
            secrets?: unknown;
        };
        assert.equal(result.secrets, undefined);
        return result.id;
    }

    it("requires only the selected verification flows and binds all three providers to the panel hostname", async (t) => {
        const fetchReal = globalThis.fetch;
        let proof: Record<string, unknown> = {};
        let endpoint = "";
        let requestFields: URLSearchParams | undefined;
        t.mock.method(
            globalThis,
            "fetch",
            async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
                const url = String(input);
                if (
                    Object.values(captchaVerifiers).some(
                        (value) => value === url,
                    )
                ) {
                    endpoint = url;
                    requestFields = init?.body as URLSearchParams;
                    return Response.json(proof);
                }
                return fetchReal(input, init);
            },
        );
        const account = await buyer("captcha");
        for (const [index, provider] of (
            ["turnstile", "recaptcha", "hcaptcha"] as const
        ).entries()) {
            const settings = await adminPut("/admin/settings/captcha", {
                captchaProvider: provider,
                captchaSiteKey: "site-fixture",
                captchaSecretKey: "secret-fixture",
                captchaOnLogin: true,
                captchaOnPasswordReset: false,
            });
            assert.equal(settings.captchaSecretKeySet, true);
            assert.equal(settings.captchaSecretKey, undefined);
            const exposed = await test.call("/site/captcha");
            assert.ok(!(await exposed.text()).includes("secret-fixture"));
            const attempt = (captchaToken?: string) =>
                test.call("/auth/login", {
                    body: { email: account.row.email, password, captchaToken },
                    headers: { "x-forwarded-for": `192.0.2.${index + 20}` },
                });
            assert.equal((await attempt()).status, 400);
            proof = { success: true, hostname: "other.test", action: "login" };
            assert.equal((await attempt("fixture")).status, 400);
            proof = { success: true, hostname: "127.0.0.1", action: "login" };
            assert.equal((await attempt("fixture")).status, 200);
            assert.equal(endpoint, captchaVerifiers[provider]);
            assert.equal(requestFields?.get("secret"), "secret-fixture");
            if (provider === "hcaptcha")
                assert.equal(requestFields?.get("sitekey"), "site-fixture");
        }
        assert.equal(
            (
                await test.call("/auth/register", {
                    body: { email: "blocked" + mailDomain, password },
                })
            ).status,
            400,
        );
        assert.equal(
            (
                await test.call("/auth/forgot", {
                    body: { email: account.row.email },
                })
            ).status,
            201,
        );
        await adminPut("/admin/settings/captcha", {
            captchaProvider: "off",
            captchaSecretKey: null,
        });
    });

    it("settles a signed Epay callback exactly once and credits a payment arriving after cancellation", async () => {
        const customer = await buyer("epay", { balance: 150 });
        const id = await gateway({
            ...gatewayBase,
            kind: "epay",
            name: "Epay",
            config: {
                apiUrl: "https://payments.example.test",
                pid: "123",
                payType: "",
            },
            secrets: { key: "epay-fixture-key" },
        });
        assert.equal(
            (
                await test.call("/admin/payment-gateways", {
                    cookie: customer.cookie,
                })
            ).status,
            403,
        );
        for (const cancelled of [false, true]) {
            const row = await order(customer.cookie);
            const requestId = nextRequest();
            const start = () =>
                test.call(`/orders/${row.id}/checkout`, {
                    cookie: customer.cookie,
                    body: { gatewayId: id, requestId },
                });
            const first = await start();
            assert.equal(first.status, 200, await first.clone().text());
            const opened = (await first.json()) as {
                url: string;
                amountMinor: number;
                feeMinor: number;
            };
            assert.deepEqual(await (await start()).json(), opened);
            assert.deepEqual([opened.amountMinor, opened.feeMinor], [2057, 57]);
            const info = new URL(opened.url);
            assert.match(
                info.searchParams.get("out_trade_no") ?? "",
                /^\d{32}$/,
            );
            const receipt = {
                pid: "123",
                out_trade_no: info.searchParams.get("out_trade_no")!,
                trade_no: cancelled ? "after-cancel" : "initial",
                money: "20.57",
                trade_status: "TRADE_SUCCESS",
                sign_type: "MD5",
            };
            const notify = (fields: Record<string, string>) =>
                fetch(
                    `${test.baseUrl}/api/payments/webhooks/epay/${id}?${new URLSearchParams(fields)}`,
                );
            assert.equal(
                (await notify({ ...receipt, sign: "a".repeat(32) })).status,
                401,
            );
            if (cancelled)
                assert.equal(
                    (
                        await test.call(`/orders/${row.id}/cancel`, {
                            cookie: customer.cookie,
                            method: "POST",
                        })
                    ).status,
                    200,
                );
            const signed = {
                ...receipt,
                sign: epaySign(receipt, "epay-fixture-key"),
            };
            const retries = await Promise.all([notify(signed), notify(signed)]);
            for (const response of retries)
                assert.equal(await response.text(), "success");
            const stored = await db.order.findUniqueOrThrow({
                where: { id: row.id },
            });
            assert.equal(stored.status, cancelled ? "cancelled" : "paid");
            assert.equal(
                (
                    await db.paymentAttempt.findFirstOrThrow({
                        where: { orderId: row.id },
                    })
                ).status,
                cancelled ? "credited" : "settled",
            );
        }
        assert.equal(
            (
                await db.user.findUniqueOrThrow({
                    where: { id: customer.row.id },
                })
            ).balance,
            2150,
        );
        assert.equal(
            await db.balanceEntry.count({ where: { userId: customer.row.id } }),
            3,
        );
    });

    it("uses Stripe checkout idempotency and verifies the signed raw session, amount and currency", async (t) => {
        const customer = await buyer("stripe");
        const id = await gateway({
            ...gatewayBase,
            kind: "stripe",
            name: "Stripe",
            config: {},
            secrets: {
                secretKey: "sk_test_fixture",
                webhookSecret: "whsec_fixture",
            },
        });
        const fetchReal = globalThis.fetch;
        let attempt = "";
        t.mock.method(
            globalThis,
            "fetch",
            async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
                if (
                    String(input) !==
                    "https://api.stripe.com/v1/checkout/sessions"
                )
                    return fetchReal(input, init);
                const form = init?.body as URLSearchParams;
                attempt = form.get("metadata[xboard_payment]")!;
                assert.equal(
                    new Headers(init?.headers).get("idempotency-key"),
                    attempt,
                );
                assert.equal(
                    form.get("line_items[0][price_data][currency]"),
                    "cny",
                );
                return Response.json({
                    id: "cs_test_fixture",
                    url: "https://checkout.stripe.com/fixture",
                });
            },
        );
        const pending = await order(customer.cookie);
        assert.equal(
            (
                await test.call(`/orders/${pending.id}/checkout`, {
                    cookie: customer.cookie,
                    body: { gatewayId: id, requestId: nextRequest() },
                })
            ).status,
            200,
        );
        const receipt = {
            id: "cs_test_fixture",
            currency: "cny",
            amount_total: 2057,
            payment_status: "paid",
            mode: "payment",
            metadata: { xboard_payment: attempt },
        };
        const callback = (
            fields: Record<string, unknown>,
            time = Math.floor(Date.now() / 1000),
            secret = "whsec_fixture",
        ) => {
            const body = JSON.stringify({
                type: "checkout.session.completed",
                data: { object: fields },
            });
            const signature = createHmac("sha256", secret)
                .update(`${time}.${body}`)
                .digest("hex");
            return fetchReal(
                `${test.baseUrl}/api/payments/webhooks/stripe/${id}`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "stripe-signature": `t=${time},v1=${signature}`,
                    },
                    body,
                },
            );
        };
        assert.equal(
            (await callback({ ...receipt, currency: "usd" })).status,
            401,
        );
        assert.equal((await callback(receipt, 1)).status, 401);
        // Sessions created by other integrations on the same Stripe account
        // are acknowledged so Stripe keeps the endpoint enabled.
        const foreign = {
            id: "cs_other_integration",
            currency: "usd",
            amount_total: 999,
            payment_status: "paid",
            mode: "payment",
            metadata: {},
        };
        assert.equal((await callback(foreign)).status, 204);
        assert.equal(
            (await callback({ ...receipt, mode: "subscription" })).status,
            204,
        );
        assert.equal(
            (
                await callback(
                    foreign,
                    Math.floor(Date.now() / 1000),
                    "whsec_other",
                )
            ).status,
            401,
        );
        assert.equal(
            await db.balanceEntry.count({ where: { userId: customer.row.id } }),
            0,
        );
        const responses = await Promise.all([
            callback(receipt),
            callback(receipt),
        ]);
        assert.deepEqual(
            responses.map(({ status }) => status),
            [204, 204],
        );
        assert.equal(
            (await db.order.findUniqueOrThrow({ where: { id: pending.id } }))
                .status,
            "paid",
        );
        assert.equal(
            await db.balanceEntry.count({ where: { userId: customer.row.id } }),
            2,
        );
        // Rotating the webhook secret retires receipts signed with the old one.
        await adminPutGateway(id, {
            ...gatewayBase,
            kind: "stripe",
            name: "Stripe",
            config: {},
            secrets: {
                secretKey: "sk_test_fixture",
                webhookSecret: "whsec_rotated",
            },
        });
        assert.equal((await callback(receipt)).status, 401);
        assert.equal(
            (
                await callback(
                    receipt,
                    Math.floor(Date.now() / 1000),
                    "whsec_rotated",
                )
            ).status,
            204,
        );
        assert.equal(
            await db.balanceEntry.count({ where: { userId: customer.row.id } }),
            2,
        );
    });

    it("awards commission on the first paid order only and never overspends or duplicates a withdrawal", async () => {
        await adminPut("/admin/settings/commission", {
            commissionEnabled: true,
            commissionRateBasisPoints: 1000,
            commissionFirstOrderOnly: true,
            withdrawEnabled: true,
            withdrawMinMinor: 20,
            withdrawMethods: ["Bank"],
        });
        const inviter = await buyer("inviter");
        const customer = await buyer("referral", {
            invitedById: inviter.row.id,
            balance: 10_000,
        });
        for (let i = 0; i < 2; i++) {
            const pending = await order(customer.cookie);
            const pay = () =>
                test.call(`/orders/${pending.id}/pay`, {
                    cookie: customer.cookie,
                    method: "POST",
                });
            const responses = await Promise.all([pay(), pay()]);
            assert.deepEqual(
                responses.map((r) => r.status),
                [200, 200],
            );
        }
        assert.equal(
            await db.commissionEntry.count({
                where: { userId: inviter.row.id, kind: "reward" },
            }),
            1,
        );
        const payout = {
            requestId: nextRequest(),
            amountMinor: 150,
            method: "Bank",
            recipient: "private-recipient-fixture",
        };
        const withdraw = () =>
            test.call("/account/commission/withdrawals", {
                cookie: inviter.cookie,
                body: payout,
            });
        const requests = await Promise.all([withdraw(), withdraw()]);
        for (const request of requests)
            assert.equal(request.status, 201, await request.clone().text());
        const [first, duplicate] = await Promise.all(
            requests.map(
                async (request) =>
                    (await request.json()) as {
                        id: string;
                        recipient?: unknown;
                    },
            ),
        );
        assert.ok(first && duplicate);
        assert.equal(first.id, duplicate.id);
        assert.equal(first.recipient, undefined);
        assert.notEqual(
            (await db.withdrawal.findUniqueOrThrow({ where: { id: first.id } }))
                .recipient,
            payout.recipient,
        );
        const insufficient = await test.call("/account/commission/transfer", {
            cookie: inviter.cookie,
            body: { requestId: nextRequest(), amountMinor: 51 },
        });
        assert.equal(insufficient.status, 400);
        const reviewed = () =>
            adminPut(`/admin/withdrawals/${first.id}`, {
                status: "rejected",
                reason: "Cancelled fixture",
            });
        await Promise.all([reviewed(), reviewed()]);
        const transfer = { amountMinor: 200, requestId: nextRequest() };
        const results = await Promise.all(
            [1, 2].map(() =>
                test.call("/account/commission/transfer", {
                    cookie: inviter.cookie,
                    body: transfer,
                }),
            ),
        );
        assert.deepEqual(
            results.map(({ status }) => status),
            [200, 200],
        );
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: inviter.row.id } }))
                .balance,
            200,
        );
        assert.equal(
            await db.balanceEntry.count({
                where: { requestId: transfer.requestId },
            }),
            1,
        );
    });

    it("binds a private Telegram chat using a one-time token and queues all three notifications", async (t) => {
        const fetchReal = globalThis.fetch;
        let signature = "";
        const sent: string[] = [];
        t.mock.method(
            globalThis,
            "fetch",
            async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
                if (!String(input).startsWith("https://api.telegram.org/"))
                    return fetchReal(input, init);
                const method = String(input).split("/").at(-1);
                const payload = JSON.parse(String(init?.body));
                if (method === "setWebhook") signature = payload.secret_token;
                if (method === "sendMessage") sent.push(payload.text);
                return Response.json({
                    ok: true,
                    result:
                        method === "getMe"
                            ? { username: "xboard_fixture_bot" }
                            : true,
                });
            },
        );
        await adminPut("/admin/settings/telegram", {
            telegramBotToken: "123456:telegram-fixture-token-123",
        });
        const link = await test.call("/account/telegram/link", {
            cookie: admin,
            method: "POST",
        });
        assert.equal(link.status, 200);
        const code = new URL(
            ((await link.json()) as { url: string }).url,
        ).searchParams.get("start");
        assert.ok(code);
        const update = (text: string, value = signature, type = "private") =>
            test.call("/telegram/webhook", {
                headers: { "x-telegram-bot-api-secret-token": value },
                body: { message: { chat: { id: 98765, type }, text } },
            });
        assert.equal((await update(`/start ${code}`, "wrong")).status, 401);
        await update(`/start ${code}`, signature, "group");
        assert.equal(
            (
                (await (
                    await test.call("/account/telegram", { cookie: admin })
                ).json()) as { linked: boolean }
            ).linked,
            false,
        );
        await update(`/start ${code}`);
        assert.equal(await db.telegramBinding.count(), 0);
        assert.equal(
            (
                (await (
                    await test.call("/account/telegram", { cookie: admin })
                ).json()) as { linked: boolean }
            ).linked,
            true,
        );
        await update("/status");
        assert.match(sent.at(-1)!, /暂无套餐/);
        const customer = await buyer("telegram");
        assert.equal(
            (
                await test.call("/tickets", {
                    cookie: customer.cookie,
                    body: {
                        subject: "Fixture",
                        content: "A fixture message for notification.",
                    },
                })
            ).status,
            201,
        );
        await order(customer.cookie);
        await db.node.create({
            data: {
                name: "Fixture offline node",
                protocol: "shadowsocks",
                host: "node.example.test",
                port: 443,
                serverPort: 443,
                tokenHash: "not-a-node-key",
                enabled: true,
                lastSeenAt: new Date(0),
            },
        });
        await Promise.all([checkOfflineNodes(), checkOfflineNodes()]);
        await Promise.all([flushTelegram(), flushTelegram()]);
        assert.equal(
            sent.filter((text) => text.startsWith("新工单")).length,
            1,
        );
        assert.equal(
            sent.filter((text) => text.startsWith("新订单")).length,
            1,
        );
        assert.equal(
            sent.filter((text) => text.startsWith("节点 #")).length,
            1,
        );
    });

    it("persists visitor and account language and keeps English and Chinese mail overrides separate", async () => {
        const customer = await buyer("english");
        await adminPut("/admin/settings/locale", { locale: "en-US" });
        assert.equal(
            (
                (await (await test.call("/site/locale")).json()) as {
                    locale: string;
                }
            ).locale,
            "en-US",
        );
        await adminPut("/admin/mail/templates/reset_password?locale=en-US", {
            subject: "English fixture reset",
            text: "Open {{link}}.",
        });
        const english = await test.call("/admin/mail/templates?locale=en-US", {
            cookie: admin,
        });
        const chinese = await test.call("/admin/mail/templates?locale=zh-CN", {
            cookie: admin,
        });
        assert.match(await english.text(), /English fixture reset/);
        assert.doesNotMatch(await chinese.text(), /English fixture reset/);
        assert.equal(
            (
                await test.call("/account/locale", {
                    cookie: customer.cookie,
                    method: "PUT",
                    body: { locale: "en-US" },
                })
            ).status,
            200,
        );
        assert.equal(
            (
                await test.call("/auth/forgot", {
                    body: { email: customer.row.email },
                    headers: { origin: ORIGIN },
                })
            ).status,
            201,
        );
        assert.equal(
            (
                await db.mail.findFirstOrThrow({
                    where: { to: customer.row.email },
                })
            ).subject,
            "English fixture reset",
        );
    });
});
