import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { adminOrderSchema, orderSchema, pagedSchema } from "@xboard/contracts";
import { db } from "../src/db";
import { startTestApp } from "./helpers";

const PASSWORD = "offline-payment-fixture";
const REASON = "收款凭证 TEST-001";
const AMOUNT = 3990;

describe("offline order settlement", () => {
    let app: Awaited<ReturnType<typeof startTestApp>>;
    let actorId: number;
    let admin: string;
    let planId: number;

    before(async () => {
        app = await startTestApp();
        const actor = await app.createUser("cashier@example.test", PASSWORD, {
            role: "admin",
        });
        actorId = actor.id;
        admin = await app.cookieFor(actor.email, PASSWORD);
        const plan = await db.plan.create({
            data: {
                name: "Offline payment fixture",
                published: true,
                transferEnable: 4096n,
                prices: { create: { amountMinor: AMOUNT, period: "monthly" } },
            },
        });
        planId = plan.id;
    });

    after(async () => await app?.stop());

    async function buyer(name: string, balance: number) {
        const user = await app.createUser(`${name}@example.test`, PASSWORD, {
            balance,
        });
        return { user, cookie: await app.cookieFor(user.email, PASSWORD) };
    }

    async function place(cookie: string, couponCode?: string) {
        const response = await app.call("/orders", {
            cookie,
            body: {
                planId,
                period: "monthly",
                requestId: randomUUID(),
                couponCode,
            },
        });
        assert.equal(response.status, 201);
        return orderSchema.parse(await response.json());
    }

    const confirm = (
        id: string,
        amountMinor: number,
        cookie = admin,
        reason = REASON,
    ) =>
        app.call(`/admin/orders/${id}/confirm-payment`, {
            cookie,
            body: { amountMinor, reason },
        });
    const wallet = (id: string, cookie: string) =>
        app.call(`/orders/${id}/pay`, { cookie, method: "POST" });
    const audited = (id: string) =>
        db.audit.findMany({
            where: { target: id, action: "order.offline_payment" },
        });

    it("checks the receipt against the discounted quote and activates exactly once", async () => {
        const { user, cookie } = await buyer("offline-customer", 73);
        await db.coupon.create({
            data: { code: "OFFLINE-TEST", amountMinor: 620, maxUses: 1 },
        });
        const order = await place(cookie, "OFFLINE-TEST");
        assert.equal(order.payableMinor, AMOUNT - 620);
        const listed = await app.call(`/admin/orders?q=${order.id}`, {
            cookie: admin,
        });
        const rows = pagedSchema(adminOrderSchema).parse(await listed.json());
        assert.equal(rows.items[0]?.expiresAt, order.expiresAt);
        assert.equal(
            (await confirm(order.id, order.payableMinor, cookie)).status,
            403,
        );
        assert.equal((await confirm(order.id, AMOUNT)).status, 409);
        assert.equal(
            await db.balanceEntry.count({ where: { userId: user.id } }),
            0,
        );
        assert.equal(
            (await db.order.findUniqueOrThrow({ where: { id: order.id } }))
                .status,
            "pending",
        );

        const confirmations = await Promise.all([
            confirm(order.id.toUpperCase(), order.payableMinor),
            confirm(order.id, order.payableMinor),
        ]);
        for (const response of confirmations) {
            assert.equal(response.status, 200);
            assert.equal(
                orderSchema.parse(await response.json()).status,
                "paid",
            );
        }
        assert.equal(
            (
                await confirm(
                    order.id,
                    order.payableMinor,
                    admin,
                    "另一张收款凭证",
                )
            ).status,
            409,
        );
        const account = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        const paid = await db.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        assert.equal(account.planId, planId);
        assert.equal(account.transferEnable, 4096n);
        assert.equal(account.balance, 73);
        assert.equal(
            account.expiredAt!.getTime() - paid.paidAt!.getTime(),
            30 * 86_400_000,
        );
        const entries = await db.balanceEntry.findMany({
            where: { userId: user.id },
        });
        const debit = entries.find((entry) => entry.orderId === order.id)!;
        const credit = entries.find((entry) => entry.orderId === null)!;
        assert.equal(entries.length, 2);
        assert.equal(debit.amountMinor, -order.payableMinor);
        assert.equal(credit.amountMinor, order.payableMinor);
        const audit = await audited(order.id);
        assert.equal(audit.length, 1);
        assert.equal(audit[0]?.actorId, actorId);
        assert.deepEqual(audit[0]?.detail, {
            userId: user.id,
            amountMinor: order.payableMinor,
            reason: REASON,
            creditEntryId: credit.id,
            paymentEntryId: debit.id,
        });
    });

    it("records a default audit reason when the receipt note is omitted or blank", async () => {
        const { user, cookie } = await buyer("offline-without-note", 0);
        const order = await place(cookie);
        const response = await app.call(
            `/admin/orders/${order.id}/confirm-payment`,
            {
                cookie: admin,
                body: { amountMinor: AMOUNT },
            },
        );
        assert.equal(response.status, 200);
        assert.equal(orderSchema.parse(await response.json()).status, "paid");
        assert.equal(
            (await confirm(order.id, AMOUNT, admin, "   ")).status,
            200,
        );
        const audit = await audited(order.id);
        assert.equal(audit.length, 1);
        assert.equal(audit[0]?.actorId, actorId);
        assert.equal(
            (audit[0]?.detail as { reason: string }).reason,
            "确认线下收款",
        );
        assert.equal(
            await db.balanceEntry.count({ where: { userId: user.id } }),
            2,
        );
    });

    it("serializes offline confirmation and a competing balance payment", async () => {
        const { user, cookie } = await buyer("offline-racing", 5000);
        const order = await place(cookie);
        const [receipt, payment] = await Promise.all([
            confirm(order.id, AMOUNT),
            wallet(order.id, cookie),
        ]);
        assert.equal(payment.status, 200);
        const offline = receipt.status === 200;
        if (!offline) assert.equal(receipt.status, 409);
        const entries = await db.balanceEntry.findMany({
            where: { userId: user.id },
        });
        assert.equal(entries.length, offline ? 2 : 1);
        assert.equal((await audited(order.id)).length, offline ? 1 : 0);
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
                .balance,
            offline ? 5000 : 5000 - AMOUNT,
        );
        assert.equal(
            await db.order.count({
                where: { userId: user.id, status: "paid" },
            }),
            1,
        );
    });

    it("refuses an expired, cancelled or wallet-settled order", async () => {
        const { user, cookie } = await buyer("offline-ineligible", 5000);
        const expired = await place(cookie);
        await db.order.update({
            where: { id: expired.id },
            data: { expiresAt: new Date(Date.now() - 60_000) },
        });
        assert.equal((await confirm(expired.id, AMOUNT)).status, 409);
        const cancelled = await place(cookie);
        assert.equal(
            (
                await app.call(`/orders/${cancelled.id}/cancel`, {
                    cookie,
                    method: "POST",
                })
            ).status,
            200,
        );
        assert.equal((await confirm(cancelled.id, AMOUNT)).status, 409);
        const paid = await place(cookie);
        assert.equal((await wallet(paid.id, cookie)).status, 200);
        assert.equal((await confirm(paid.id, AMOUNT)).status, 409);
        assert.equal(
            await db.balanceEntry.count({ where: { userId: user.id } }),
            1,
        );
        for (const order of [expired, cancelled, paid])
            assert.equal((await audited(order.id)).length, 0);
    });
});
