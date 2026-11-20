import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
    accountSchema,
    orderSchema,
    trafficItemSchema,
    type CreateOrderBody,
} from "@xboard/contracts";
import { db } from "../src/db";
import { queueBillingReminders, runMonthlyResets } from "../src/jobs/billing";
import { runMaintenance } from "../src/jobs/maintenance";
import {
    nextMonthlyReset,
    trafficSchedule,
} from "../src/modules/account/traffic-cycle";
import { recordTraffic } from "../src/modules/nodes/service";
import { DAY_MS } from "../src/modules/orders/credit";
import { SETTING_DEFAULTS } from "../src/modules/site/service";
import { setTestSmtp, startTestApp } from "./helpers";

const PASSWORD = "test-billing-password";
const offset = (days: number, start = Date.now()) =>
    new Date(start + days * DAY_MS);

it("uses Beijing midnight and restores the original day after a short month", () => {
    const start = new Date("2028-01-31T04:00:00Z");
    const february = nextMonthlyReset(start, 31);
    assert.equal(february.toISOString(), "2028-02-28T16:00:00.000Z");
    assert.equal(
        nextMonthlyReset(february, 31).toISOString(),
        "2028-03-30T16:00:00.000Z",
    );
    assert.equal(
        trafficSchedule("month_start", start).nextTrafficResetAt?.toISOString(),
        "2028-01-31T16:00:00.000Z",
    );
});

it("anchors annual schedules to Beijing New Year's Day or the purchase date", () => {
    const start = new Date("2028-02-29T04:00:00Z");
    const newYear = trafficSchedule("year_start", start);
    assert.equal(
        newYear.nextTrafficResetAt?.toISOString(),
        "2028-12-31T16:00:00.000Z",
    );
    const anniversary = trafficSchedule("activation_anniversary", start);
    assert.equal(anniversary.trafficResetMonth, 2);
    assert.equal(anniversary.trafficResetDay, 29);
    assert.equal(
        anniversary.nextTrafficResetAt?.toISOString(),
        "2029-02-27T16:00:00.000Z",
    );
});

describe("billing", () => {
    let app: Awaited<ReturnType<typeof startTestApp>>;
    let expensiveId: number;
    let smallId: number;
    let admin: string;

    before(async () => {
        app = await startTestApp();
        await app.createUser("admin-billing@example.test", PASSWORD, {
            role: "admin",
        });
        admin = await app.cookieFor("admin-billing@example.test", PASSWORD);
        const expensive = await db.plan.create({
            data: {
                name: "Annual",
                published: true,
                transferEnable: 1000n,
                trafficResetMode: "activation_day",
                trafficResetPriceMinor: 500,
                prices: { create: { period: "yearly", amountMinor: 36_500 } },
            },
        });
        expensiveId = expensive.id;
        const small = await db.plan.create({
            data: {
                name: "Monthly",
                published: true,
                transferEnable: 100n,
                prices: { create: { period: "monthly", amountMinor: 1_000 } },
            },
        });
        smallId = small.id;
    });
    after(async () => await app?.stop());

    async function create(cookie: string, body: CreateOrderBody) {
        const result = await app.call("/orders", { cookie, body });
        assert.equal(
            result.status,
            201,
            result.status === 201 ? undefined : await result.text(),
        );
        return orderSchema.parse(await result.json());
    }

    async function pay(cookie: string, id: string) {
        const result = await app.call(`/orders/${id}/pay`, {
            cookie,
            method: "POST",
        });
        assert.equal(
            result.status,
            200,
            result.status === 200 ? undefined : await result.text(),
        );
        return orderSchema.parse(await result.json());
    }

    it("sells all new terms and settles a one-time purchase exactly once", async () => {
        const periods = [
            ["half_yearly", 180],
            ["two_yearly", 730],
            ["three_yearly", 1095],
            ["onetime", 0],
        ] as const;
        const response = await app.call("/admin/plans", {
            cookie: admin,
            body: {
                name: "New billing terms",
                content: "",
                sort: 0,
                published: true,
                transferBytes: "1000",
                trafficResetMode: "year_start",
                prices: periods.map(([period]) => ({
                    period,
                    amountMinor: 1000,
                })),
            },
        });
        assert.equal(response.status, 201, await response.clone().text());
        const plan = (await response.json()) as { id: number };
        for (const [period, days] of periods) {
            const email = `${period}@example.test`;
            const user = await app.createUser(email, PASSWORD, {
                balance: 1500,
            });
            const cookie = await app.cookieFor(email, PASSWORD);
            const requestId = randomUUID();
            const requests = await Promise.all(
                [1, 2].map(() =>
                    create(cookie, { requestId, planId: plan.id, period }),
                ),
            );
            assert.equal(requests[0]!.id, requests[1]!.id);
            assert.equal(requests[0]!.durationDays, days);
            await Promise.all(requests.map(({ id }) => pay(cookie, id)));
            const updated = await db.user.findUniqueOrThrow({
                where: { id: user.id },
            });
            assert.equal(updated.balance, 500);
            assert.equal(updated.expiredAt === null, period === "onetime");
            assert.equal(
                await db.balanceEntry.count({
                    where: { orderId: requests[0]!.id },
                }),
                1,
            );
            if (period === "onetime") {
                const duplicate = await app.call("/orders", {
                    cookie,
                    body: { requestId: randomUUID(), planId: plan.id, period },
                });
                assert.equal(duplicate.status, 409);
            }
        }
    });

    it("advances leap day anniversaries once and keeps the original day across years", async () => {
        const user = await app.createUser(
            "annual-reset@example.test",
            PASSWORD,
            {
                planId: expensiveId,
                expiredAt: null,
                transferEnable: 1000n,
                download: 345n,
                ...trafficSchedule(
                    "activation_anniversary",
                    new Date("2028-02-29T04:00:00Z"),
                ),
            },
        );
        const now = new Date("2031-02-28T00:00:00Z");
        await Promise.all([runMonthlyResets(now), runMonthlyResets(now)]);
        const updated = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(updated.download, 0n);
        assert.equal(
            updated.nextTrafficResetAt?.toISOString(),
            "2032-02-28T16:00:00.000Z",
        );
        assert.equal(
            await db.audit.count({
                where: {
                    target: String(user.id),
                    action: "traffic.annual_reset",
                },
            }),
            1,
        );
    });

    it("prorates a legacy paid term and makes concurrent downgrade retries refund once", async () => {
        const email = "downgrade@example.test";
        const now = Date.now();
        const user = await app.createUser(email, PASSWORD, {
            planId: expensiveId,
            balance: 300,
            download: 123n,
            expiredAt: offset(180, now),
            transferEnable: 1000n,
        });
        await db.order.create({
            data: {
                userId: user.id,
                planId: expensiveId,
                requestId: randomUUID(),
                status: "paid",
                planName: "Annual",
                period: "yearly",
                amountMinor: 36_500,
                transferBytes: 1000n,
                durationDays: 365,
                paidAt: offset(-185, now),
                expiresAt: offset(-185, now),
            },
        });
        const cookie = await app.cookieFor(email, PASSWORD);
        const input = {
            planId: smallId,
            period: "monthly",
            requestId: randomUUID(),
        } as const;
        const [first, retry] = await Promise.all([
            create(cookie, input),
            create(cookie, input),
        ]);
        assert.equal(first.id, retry.id);
        assert.ok(first.creditMinor >= 17_999 && first.creditMinor <= 18_000);
        assert.equal(first.payableMinor, 1_000 - first.creditMinor);
        await Promise.all([pay(cookie, first.id), pay(cookie, first.id)]);
        const after = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(after.balance, 300 - first.payableMinor);
        assert.equal(after.planId, smallId);
        assert.equal(after.download, 0n);
        const entries = await db.balanceEntry.findMany({
            where: { orderId: first.id },
        });
        assert.deepEqual(
            entries.map((e) => e.amountMinor),
            [-first.payableMinor],
        );

        const next = await create(cookie, {
            planId: expensiveId,
            period: "yearly",
            requestId: randomUUID(),
        });
        assert.ok(next.creditMinor <= 1_000);
        assert.equal(
            (
                await app.call(`/orders/${next.id}/pay`, {
                    cookie,
                    method: "POST",
                })
            ).status,
            400,
        );
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
                .planId,
            smallId,
        );
    });

    it("keeps one monthly quota on renewal and sells a reset without changing expiry", async () => {
        const email = "reset@example.test";
        const user = await app.createUser(email, PASSWORD, {
            balance: 100_000,
        });
        const cookie = await app.cookieFor(email, PASSWORD);
        const buy = () =>
            create(cookie, {
                planId: expensiveId,
                period: "yearly",
                requestId: randomUUID(),
            });
        await pay(cookie, (await buy()).id);
        const start = await db.user.update({
            where: { id: user.id },
            data: { upload: 80n, download: 10n },
        });
        await pay(cookie, (await buy()).id);
        const renewed = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(renewed.transferEnable, 1000n);
        assert.equal(renewed.upload, 80n);
        assert.equal(
            renewed.nextTrafficResetAt?.getTime(),
            start.nextTrafficResetAt?.getTime(),
        );
        assert.equal(
            renewed.expiredAt!.getTime() - start.expiredAt!.getTime(),
            365 * DAY_MS,
        );
        const order = await create(cookie, {
            planId: expensiveId,
            kind: "traffic_reset",
            requestId: randomUUID(),
        });
        assert.equal(order.period, null);
        assert.equal(order.payableMinor, 500);
        await Promise.all([pay(cookie, order.id), pay(cookie, order.id)]);
        const reset = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(reset.balance, renewed.balance - 500);
        assert.equal(reset.expiredAt?.getTime(), renewed.expiredAt?.getTime());
        assert.equal(reset.upload + reset.download, 0n);
        assert.equal(
            await db.audit.count({
                where: {
                    action: "traffic.paid_reset",
                    target: String(user.id),
                },
            }),
            1,
        );
    });

    it("credits prepaid renewals on upgrade and rejects a quote after the expiry was edited", async () => {
        const email = "upgrade@example.test";
        const user = await app.createUser(email, PASSWORD, {
            balance: 100_000,
        });
        const cookie = await app.cookieFor(email, PASSWORD);
        const buy = (planId: number, period: "monthly" | "yearly") =>
            create(cookie, { planId, period, requestId: randomUUID() });
        await pay(cookie, (await buy(smallId, "monthly")).id);
        await pay(cookie, (await buy(smallId, "monthly")).id);
        const before = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        const stale = await buy(expensiveId, "yearly");
        assert.ok(stale.creditMinor >= 1998 && stale.creditMinor <= 2000);
        await db.user.update({
            where: { id: user.id },
            data: { expiredAt: offset(1, before.expiredAt!.getTime()) },
        });
        const rejected = await app.call(`/orders/${stale.id}/pay`, {
            cookie,
            method: "POST",
        });
        assert.equal(rejected.status, 409);
        assert.equal(
            await db.balanceEntry.count({ where: { orderId: stale.id } }),
            0,
        );
        assert.equal(
            (
                await app.call(`/orders/${stale.id}/cancel`, {
                    cookie,
                    method: "POST",
                })
            ).status,
            200,
        );
        const fresh = await buy(expensiveId, "yearly");
        await pay(cookie, fresh.id);
        const upgraded = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(upgraded.balance, before.balance - fresh.payableMinor);
        assert.equal(upgraded.planId, expensiveId);
    });

    it("lets maintenance and traffic reporting reset a due cycle only once", async () => {
        const email = "monthly-cycle@example.test";
        const user = await app.createUser(email, PASSWORD, {
            planId: expensiveId,
            expiredAt: offset(90),
            transferEnable: 1000n,
            upload: 800n,
            trafficReminderMask: 3,
            ...trafficSchedule("activation_day", offset(-31)),
            nextTrafficResetAt: new Date(Date.now() - 2_000),
        });
        const node = await db.node.create({
            data: {
                name: "Monthly reset test",
                host: "loopback.example.test",
                protocol: "vless",
                port: 443,
                serverPort: 443,
                tokenHash: "fixture",
                plans: { create: { planId: expensiveId } },
            },
        });
        await Promise.all([
            runMonthlyResets(new Date()),
            recordTraffic(node, { [user.id]: [12, 3] }),
        ]);
        await runMonthlyResets(new Date());
        const snap = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(snap.upload, 12n);
        assert.equal(snap.download, 3n);
        assert.equal(snap.trafficReminderMask, 0);
        assert.ok(snap.nextTrafficResetAt! > new Date());
        assert.equal(
            await db.audit.count({
                where: {
                    target: String(user.id),
                    action: "traffic.monthly_reset",
                },
            }),
            1,
        );

        await db.$queryRaw`SELECT setval(pg_get_serial_sequence('"TrafficRecord"', 'id'), 2147483647)`;
        await recordTraffic(node, { [user.id]: [1, 1] });
        const cookie = await app.cookieFor(email, PASSWORD);
        const rows = trafficItemSchema
            .array()
            .parse(
                await (await app.call("/account/traffic", { cookie })).json(),
            );
        assert.ok(rows.some((row) => row.id === "2147483648"));
        const account = accountSchema.parse(
            await (await app.call("/account", { cookie })).json(),
        );
        assert.equal(
            account.nextTrafficResetAt,
            snap.nextTrafficResetAt?.toISOString(),
        );
    });

    it("queues one message for each expiry and traffic threshold with concurrent workers", async () => {
        await setTestSmtp("127.0.0.1");
        try {
            const email = "billing-notices@example.test";
            const now = new Date();
            const user = await app.createUser(email, PASSWORD, {
                planId: smallId,
                expiredAt: offset(2, now.getTime()),
                transferEnable: 100n,
                download: 80n,
            });
            await queueBillingReminders(now);
            assert.equal(await db.mail.count({ where: { to: email } }), 0);
            assert.equal(
                (
                    await app.call("/admin/settings", {
                        method: "PUT",
                        cookie: admin,
                        body: {
                            ...SETTING_DEFAULTS,
                            expiryReminders: true,
                            trafficReminders: true,
                        },
                    })
                ).status,
                200,
            );
            await Promise.all([
                queueBillingReminders(now),
                queueBillingReminders(now),
            ]);
            await db.user.update({
                where: { id: user.id },
                data: { download: 95n },
            });
            const tomorrow = offset(1, now.getTime());
            await Promise.all([
                queueBillingReminders(tomorrow),
                queueBillingReminders(tomorrow),
            ]);
            const messages = await db.mail.findMany({
                where: { to: email },
                orderBy: { id: "asc" },
            });
            assert.deepEqual(
                messages.map((mail) => mail.subject),
                [
                    "Xboard 套餐将在 2 天内到期",
                    "Xboard 流量已使用 80%",
                    "Xboard 套餐将在 1 天内到期",
                    "Xboard 流量已使用 95%",
                ],
            );
        } finally {
            await setTestSmtp();
        }
    });

    /** Run `body` with SMTP configured and both reminder kinds switched on. */
    async function withReminders(body: () => Promise<void>) {
        await setTestSmtp("127.0.0.1");
        try {
            assert.equal(
                (
                    await app.call("/admin/settings", {
                        method: "PUT",
                        cookie: admin,
                        body: {
                            ...SETTING_DEFAULTS,
                            expiryReminders: true,
                            trafficReminders: true,
                        },
                    })
                ).status,
                200,
            );
            await body();
        } finally {
            await setTestSmtp();
        }
    }

    it("sends one traffic mail for the highest stage crossed and marks both expiry stages", async () => {
        await withReminders(async () => {
            const email = "jump-stages@example.test";
            const now = new Date();
            const user = await app.createUser(email, PASSWORD, {
                planId: smallId,
                expiredAt: new Date(now.getTime() + 0.5 * DAY_MS),
                transferEnable: 100n,
                download: 96n,
            });
            await queueBillingReminders(now);
            const mail = await db.mail.findMany({ where: { to: email } });
            assert.deepEqual(mail.map((m) => m.subject).sort(), [
                "Xboard 套餐将在 1 天内到期",
                "Xboard 流量已使用 95%",
            ]);
            const saved = await db.user.findUniqueOrThrow({
                where: { id: user.id },
            });
            assert.equal(saved.trafficReminderMask, 3);
            assert.equal(saved.expiryReminderMask, 3);
            await queueBillingReminders(now);
            assert.equal(await db.mail.count({ where: { to: email } }), 2);
        });
    });

    it("renews by extending the term without stacking quota", async () => {
        await withReminders(async () => {
            const email = "renewal-quota@example.test";
            const now = new Date();
            const expiredAt = offset(20, now.getTime());
            const user = await app.createUser(email, PASSWORD, {
                planId: smallId,
                balance: 5_000,
                expiredAt,
                transferEnable: 100n,
                download: 85n,
                trafficReminderMask: 1,
            });
            const cookie = await app.cookieFor(email, PASSWORD);
            await pay(
                cookie,
                (
                    await create(cookie, {
                        planId: smallId,
                        period: "monthly",
                        requestId: randomUUID(),
                    })
                ).id,
            );
            const renewed = await db.user.findUniqueOrThrow({
                where: { id: user.id },
            });
            // Only the expiry moves; unused traffic is not added on top.
            assert.equal(renewed.transferEnable, 100n);
            assert.equal(renewed.download, 85n);
            assert.equal(
                renewed.expiredAt!.getTime(),
                expiredAt.getTime() + 30 * 86_400_000,
            );
            // The 80% mail was already sent for this usage; only 95% is left.
            assert.equal(renewed.trafficReminderMask, 1);
            await db.user.update({
                where: { id: user.id },
                data: { download: 96n },
            });
            await queueBillingReminders(new Date());
            assert.deepEqual(
                (await db.mail.findMany({ where: { to: email } })).map(
                    (m) => m.subject,
                ),
                ["Xboard 流量已使用 95%"],
            );
        });
    });

    it("lets a permanent plan switch without credit, but not renew", async () => {
        const email = "permanent@example.test";
        const user = await app.createUser(email, PASSWORD, {
            planId: smallId,
            balance: 40_000,
            expiredAt: null,
            transferEnable: 100n,
        });
        const cookie = await app.cookieFor(email, PASSWORD);
        const renewal = await app.call("/orders", {
            cookie,
            body: {
                planId: smallId,
                period: "monthly",
                requestId: randomUUID(),
            },
        });
        assert.equal(renewal.status, 409);
        assert.match(JSON.stringify(await renewal.json()), /长期有效/);

        const quote = await create(cookie, {
            planId: expensiveId,
            period: "yearly",
            requestId: randomUUID(),
        });
        assert.equal(quote.replacesPlan, true);
        assert.equal(quote.creditMinor, 0);
        assert.equal(quote.payableMinor, 36_500);
        const paid = await pay(cookie, quote.id);
        assert.equal(paid.replacesPlan, true);
        const switched = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(switched.planId, expensiveId);
        assert.equal(switched.balance, 40_000 - 36_500);
        assert.ok(switched.expiredAt && switched.expiredAt > offset(360));
    });

    it("records usage from before a due monthly reset in the paid reset audit", async () => {
        const email = "paid-reset-audit@example.test";
        const user = await app.createUser(email, PASSWORD, {
            planId: expensiveId,
            balance: 1_000,
            expiredAt: offset(90),
            transferEnable: 1000n,
            upload: 800n,
            download: 100n,
            ...trafficSchedule("activation_day", offset(-31)),
            nextTrafficResetAt: new Date(Date.now() - 2_000),
        });
        const cookie = await app.cookieFor(email, PASSWORD);
        await pay(
            cookie,
            (
                await create(cookie, {
                    planId: expensiveId,
                    kind: "traffic_reset",
                    requestId: randomUUID(),
                })
            ).id,
        );
        const row = await db.audit.findFirstOrThrow({
            where: { target: String(user.id), action: "traffic.paid_reset" },
        });
        assert.deepEqual(row.detail, {
            orderId: (row.detail as { orderId: string }).orderId,
            upload: "800",
            download: "100",
        });
    });

    it("audits user cancellation and maintenance expiry of pending orders", async () => {
        const email = "cancel-audit@example.test";
        const user = await app.createUser(email, PASSWORD);
        const cookie = await app.cookieFor(email, PASSWORD);
        const cancelled = await create(cookie, {
            planId: smallId,
            period: "monthly",
            requestId: randomUUID(),
        });
        assert.equal(
            (
                await app.call(`/orders/${cancelled.id}/cancel`, {
                    cookie,
                    method: "POST",
                })
            ).status,
            200,
        );
        const row = await db.audit.findFirstOrThrow({
            where: { target: cancelled.id, action: "order.cancel" },
        });
        assert.equal(row.actorId, user.id);

        const stale = await db.order.create({
            data: {
                userId: user.id,
                planId: smallId,
                requestId: randomUUID(),
                planName: "Monthly",
                period: "monthly",
                amountMinor: 1_000,
                transferBytes: 100n,
                durationDays: 30,
                expiresAt: new Date(Date.now() - 1_000),
            },
        });
        await runMaintenance();
        assert.equal(
            (await db.order.findUniqueOrThrow({ where: { id: stale.id } }))
                .status,
            "cancelled",
        );
        const expired = await db.audit.findMany({
            where: { target: stale.id, action: "order.expire" },
        });
        assert.equal(expired.length, 1);
        assert.equal(expired[0]!.actorId, 0);
        // A second run finds nothing left to expire.
        await runMaintenance();
        assert.equal(
            await db.audit.count({
                where: { target: stale.id, action: "order.expire" },
            }),
            1,
        );
    });

    it("rejects invalid balances, traffic and prices at the database boundary", async () => {
        const user = await app.createUser("constraints@example.test", PASSWORD);
        await assert.rejects(
            db.user.update({ where: { id: user.id }, data: { balance: -1 } }),
        );
        await assert.rejects(
            db.user.update({ where: { id: user.id }, data: { upload: -1n } }),
        );
        await assert.rejects(
            db.planPrice.updateMany({
                where: { planId: smallId },
                data: { amountMinor: 0 },
            }),
        );
    });
});
