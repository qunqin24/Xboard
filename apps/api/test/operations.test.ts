import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
    giftCreatedSchema,
    helpArticleSchema,
    orderSchema,
    rankingsSchema,
} from "@xboard/contracts";
import { db } from "../src/db";
import { startTestApp } from "./helpers";

const PASSWORD = "ops-test-password";

describe("promotions and operations", () => {
    let app: Awaited<ReturnType<typeof startTestApp>>;
    let admin: string;
    let planId: number;
    let alternatePlanId: number;
    const smtp = process.env.SMTP_HOST;

    before(async () => {
        app = await startTestApp();
        process.env.SMTP_HOST = "127.0.0.1";
        await app.createUser("admin-operations@example.test", PASSWORD, {
            role: "admin",
        });
        admin = await app.cookieFor("admin-operations@example.test", PASSWORD);
        const plan = await db.plan.create({
            data: {
                name: "Test plan",
                transferEnable: 1000n,
                published: true,
                prices: { create: { period: "monthly", amountMinor: 1000 } },
            },
        });
        planId = plan.id;
        const alternate = await db.plan.create({
            data: {
                name: "Alternating",
                transferEnable: 100n,
                published: true,
                prices: { create: { period: "monthly", amountMinor: 800 } },
            },
        });
        alternatePlanId = alternate.id;
    });
    after(async () => {
        if (smtp === undefined) delete process.env.SMTP_HOST;
        else process.env.SMTP_HOST = smtp;
        await app?.stop();
    });

    async function buyer(name: string, data: Record<string, unknown> = {}) {
        const email = name + "@example.test";
        const user = await app.createUser(email, PASSWORD, {
            balance: 5000,
            ...data,
        });
        const cookie = user.banned ? "" : await app.cookieFor(email, PASSWORD);
        return { user, cookie };
    }

    it("applies a coupon once while two buyers compete for its last use", async () => {
        const buyers = await Promise.all([
            buyer("coupon-buyer-one"),
            buyer("coupon-buyer-two"),
        ]);
        const promotion = {
            code: "LAST-ONE",
            amountMinor: 600,
            maxUses: 1,
            expiresAt: null,
        };
        assert.equal(
            (
                await app.call("/admin/coupons", {
                    cookie: buyers[0]!.cookie,
                    body: promotion,
                })
            ).status,
            403,
        );
        assert.equal(
            (
                await app.call("/admin/coupons", {
                    cookie: admin,
                    body: promotion,
                })
            ).status,
            201,
        );
        const orders = await Promise.all(
            buyers.map(async ({ cookie }) =>
                orderSchema.parse(
                    await (
                        await app.call("/orders", {
                            cookie,
                            body: {
                                planId,
                                period: "monthly",
                                requestId: randomUUID(),
                                couponCode: "last-one",
                            },
                        })
                    ).json(),
                ),
            ),
        );
        assert.deepEqual(
            orders.map(({ payableMinor }) => payableMinor),
            [400, 400],
        );
        const settled = await Promise.all(
            orders.map(({ id }, index) =>
                app.call(`/orders/${id}/pay`, {
                    method: "POST",
                    cookie: buyers[index]!.cookie,
                }),
            ),
        );
        assert.deepEqual(
            settled.map((result) => result.status).sort(),
            [200, 409],
        );
        assert.equal(
            await db.balanceEntry.count({
                where: { orderId: { in: orders.map((order) => order.id) } },
            }),
            1,
        );
        const winner =
            buyers[settled.findIndex((result) => result.status === 200)]!;
        const switched = await app.call("/orders", {
            cookie: winner.cookie,
            body: {
                planId: alternatePlanId,
                period: "monthly",
                requestId: randomUUID(),
            },
        });
        const quote = orderSchema.parse(await switched.json());
        assert.ok(quote.creditMinor > 0 && quote.creditMinor <= 400);
    });

    it("grants a balance code once and keeps gifted subscription time out of refunds", async () => {
        const a = await buyer("gift-a");
        const b = await buyer("gift-b");
        const balance = giftCreatedSchema.parse(
            await (
                await app.call("/admin/gift-codes", {
                    cookie: admin,
                    body: {
                        kind: "balance",
                        label: "Example balance",
                        amountMinor: 1500,
                        expiresAt: null,
                    },
                })
            ).json(),
        );
        const claim = (cookie: string, code: string) =>
            app.call("/account/redeem", { cookie, body: { code } });
        const claims = await Promise.all([
            claim(a.cookie, balance.code),
            claim(b.cookie, balance.code),
        ]);
        assert.deepEqual(
            claims.map((response) => response.status).sort(),
            [201, 400],
        );
        const winner = claims[0]!.status === 201 ? a : b;
        assert.equal((await claim(winner.cookie, balance.code)).status, 201);
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: winner.user.id } }))
                .balance,
            6500,
        );
        assert.equal(
            await db.balanceEntry.count({ where: { userId: winner.user.id } }),
            1,
        );
        const gift = giftCreatedSchema.parse(
            await (
                await app.call("/admin/gift-codes", {
                    cookie: admin,
                    body: {
                        kind: "subscription",
                        label: "Complimentary term",
                        planId,
                        period: "monthly",
                        expiresAt: null,
                    },
                })
            ).json(),
        );
        assert.equal((await claim(winner.cookie, gift.code)).status, 201);
        const active = await db.user.findUniqueOrThrow({
            where: { id: winner.user.id },
        });
        assert.equal(active.planId, planId);
        assert.ok(active.expiredAt! > new Date());
        const switched = await app.call("/orders", {
            cookie: winner.cookie,
            body: {
                planId: alternatePlanId,
                period: "monthly",
                requestId: randomUUID(),
            },
        });
        assert.equal(orderSchema.parse(await switched.json()).creditMinor, 0);
        assert.ok(
            !(
                await (
                    await app.call("/admin/gift-codes", { cookie: admin })
                ).text()
            ).includes(gift.code),
        );
    });

    it("publishes edited help for customers and keeps drafts private", async () => {
        const { cookie } = await buyer("help-reader");
        const baseline = helpArticleSchema
            .array()
            .parse(await (await app.call("/help", { cookie })).json());
        assert.ok(
            baseline.some(({ title }) => title === "安装客户端与导入订阅"),
        );
        const body = {
            title: "新手指南",
            body: "说明",
            sort: 1,
            published: false,
        };
        const draft = helpArticleSchema.parse(
            await (
                await app.call("/admin/help", { cookie: admin, body })
            ).json(),
        );
        assert.equal((await app.call("/admin/help", { cookie })).status, 403);
        assert.ok(
            !(await (await app.call("/help", { cookie })).text()).includes(
                body.title,
            ),
        );
        assert.equal(
            (
                await app.call(`/admin/help/${draft.id}`, {
                    cookie: admin,
                    method: "PUT",
                    body: { ...body, published: true, body: "更新后的说明" },
                })
            ).status,
            200,
        );
        assert.ok(
            (await (await app.call("/help", { cookie })).text()).includes(
                "更新后的说明",
            ),
        );
        assert.equal(
            (
                await app.call(`/admin/help/${draft.id}`, {
                    cookie: admin,
                    method: "DELETE",
                })
            ).status,
            200,
        );
    });

    it("enables and disables nodes in bulk, audited and admin only", async () => {
        const make = (name: string, enabled: boolean) =>
            db.node.create({
                data: {
                    name,
                    host: "node.example.test",
                    port: 443,
                    serverPort: 443,
                    protocol: "vless",
                    tokenHash: `bulk-${name}`,
                    enabled,
                },
            });
        const [on, off, gone] = await Promise.all([
            make("bulk-on", true),
            make("bulk-off", false),
            make("bulk-gone", false),
        ]);
        await db.node.update({
            where: { id: gone.id },
            data: { deletedAt: new Date() },
        });
        const { cookie } = await buyer("bulk-nodes-user");
        const ids = [on.id, off.id, gone.id, on.id];
        assert.equal(
            (
                await app.call("/admin/nodes/bulk-enabled", {
                    cookie,
                    body: { ids, enabled: true },
                })
            ).status,
            403,
        );
        assert.equal(
            (
                await app.call("/admin/nodes/bulk-enabled", {
                    cookie: admin,
                    body: { ids: [], enabled: true },
                })
            ).status,
            400,
        );
        const response = await app.call("/admin/nodes/bulk-enabled", {
            cookie: admin,
            body: { ids, enabled: true },
        });
        assert.equal(response.status, 200);
        // `off` changes; `on` is already enabled and `gone` is deleted.
        assert.deepEqual(await response.json(), { updated: 1, skipped: 2 });
        assert.equal(
            (await db.node.findUniqueOrThrow({ where: { id: off.id } }))
                .enabled,
            true,
        );
        assert.equal(
            (await db.node.findUniqueOrThrow({ where: { id: gone.id } }))
                .enabled,
            false,
        );
        assert.equal(
            await db.audit.count({ where: { action: "node.bulk_enable" } }),
            1,
        );
        await app.call("/admin/nodes/bulk-enabled", {
            cookie: admin,
            body: { ids: [on.id, off.id], enabled: false },
        });
        assert.equal(
            await db.node.count({
                where: { id: { in: [on.id, off.id] }, enabled: false },
            }),
            2,
        );
    });

    it("creates a pending manual order, ranks reported traffic, and audits a bulk reset", async () => {
        const { user, cookie } = await buyer("manual-order");
        const another = await buyer("bulk-reset");
        const body = { planId, period: "monthly", requestId: randomUUID() };
        const place = () =>
            app.call(`/admin/users/${user.id}/orders`, { cookie: admin, body });
        const [first, second] = await Promise.all([place(), place()]);
        const order = orderSchema.parse(await first.json());
        assert.equal(order.status, "pending");
        assert.equal(orderSchema.parse(await second.json()).id, order.id);
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
                .balance,
            5000,
        );
        assert.equal(
            await db.audit.count({
                where: { target: order.id, action: "order.create" },
            }),
            1,
        );
        assert.ok(
            (await (await app.call("/orders", { cookie })).text()).includes(
                order.id,
            ),
        );
        const node = await db.node.create({
            data: {
                name: "Ranking node",
                host: "node.example.test",
                port: 443,
                serverPort: 443,
                protocol: "vless",
                tokenHash: "fixture",
            },
        });
        await db.trafficRecord.createMany({
            data: [
                {
                    nodeId: node.id,
                    userId: user.id,
                    upload: 42n,
                    download: 58n,
                },
                {
                    nodeId: node.id,
                    userId: another.user.id,
                    upload: 40n,
                    download: 10n,
                },
            ],
        });
        const rank = rankingsSchema.parse(
            await (
                await app.call("/admin/rankings?days=7", { cookie: admin })
            ).json(),
        );
        assert.deepEqual(
            rank.users.map((row) => row.id),
            [user.id, another.user.id],
        );
        assert.equal(rank.nodes[0]?.trafficBytes, "150");
        await db.user.updateMany({
            where: { id: { in: [user.id, another.user.id] } },
            data: { download: 987n },
        });
        const reset = await app.call("/admin/users/reset-traffic", {
            cookie: admin,
            body: {
                ids: [user.id, another.user.id, 2_000_000],
                reason: "Test reset",
            },
        });
        assert.deepEqual(await reset.json(), { updated: 2, skipped: 1 });
        assert.equal(
            await db.user.count({
                where: { id: { in: [user.id, another.user.id] }, download: 0n },
            }),
            2,
        );
        assert.equal(
            await db.trafficRecord.count({ where: { nodeId: node.id } }),
            2,
        );
        assert.equal(
            await db.audit.count({ where: { action: "traffic.reset" } }),
            2,
        );
    });

    it("renders saved mail templates and enqueues each broadcast recipient once", async () => {
        const recipient = await buyer("mail-recipient");
        const banned = await buyer("mail-banned", { banned: true });
        const save = (body: { subject: string; text: string }) =>
            app.call("/admin/mail/templates/verify_email", {
                method: "PUT",
                cookie: admin,
                body,
            });
        assert.equal(
            (await save({ subject: "主题", text: "正文" })).status,
            400,
        );
        assert.equal(
            (await save({ subject: "{{link}}", text: "{{link}}" })).status,
            400,
        );
        assert.equal(
            (
                await save({
                    subject: "{{siteName}} 验证",
                    text: "请打开 {{link}}",
                })
            ).status,
            200,
        );
        assert.equal(
            (
                await app.call("/account/verify-email", {
                    method: "POST",
                    cookie: recipient.cookie,
                })
            ).status,
            201,
        );
        const message = await db.mail.findFirstOrThrow({
            where: { to: recipient.user.email },
        });
        assert.equal(message.subject, "Xboard 验证");
        assert.match(message.text, /请打开 .*\/recover#verify:/);

        const body = {
            requestId: randomUUID(),
            scope: "selected",
            ids: [recipient.user.id, banned.user.id],
            subject: "Test broadcast",
            text: "Fixture",
        };
        const broadcast = (input: object) =>
            app.call("/admin/mail/broadcast", { cookie: admin, body: input });
        const retries = await Promise.all([broadcast(body), broadcast(body)]);
        assert.deepEqual(
            await Promise.all(retries.map((result) => result.json())),
            [{ recipients: 1 }, { recipients: 1 }],
        );
        assert.equal(
            await db.mail.count({ where: { subject: body.subject } }),
            1,
        );
        assert.equal(
            (await broadcast({ ...body, text: "Different message" })).status,
            409,
        );
        const all = await broadcast({
            requestId: randomUUID(),
            scope: "all",
            subject: "Everybody",
            text: "Fixture",
        });
        assert.deepEqual(await all.json(), {
            recipients: await db.user.count({ where: { banned: false } }),
        });
        assert.equal(
            await db.mail.count({ where: { to: banned.user.email } }),
            0,
        );
    });
});
