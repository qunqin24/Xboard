import type { Order as OrderRow, User } from "@prisma/client";
import type {
    CreateOrderBody,
    OfflineOrderPaymentBody,
    Order,
    Period,
} from "@xboard/contracts";
import { db, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { hasActivePlan } from "../account/entitlement";
import { clearUsage, resetDueTraffic } from "../account/traffic-cycle";
import { audit } from "../admin/shared";
import { availableCoupon } from "../promotions/coupon";
import { enqueueTelegram } from "../telegram/service";
import { awardCommission } from "../commission/service";
import { MAX_BALANCE_MINOR, remainingPlanCredit } from "./credit";
import {
    applyTerm,
    lockBuyer,
    orderPlan,
    planSnapshot,
    purchaseType,
} from "./terms";

const PAYMENT_WINDOW_MS = 30 * 60_000;
const OFFLINE_PAYMENT_ACTION = "order.offline_payment";

type OfflineReceipt = Required<OfflineOrderPaymentBody> & { actorId: number };
export function payableAmount(
    order: Pick<OrderRow, "amountMinor" | "creditMinor" | "discountMinor">,
) {
    return order.amountMinor - order.creditMinor - order.discountMinor;
}

function toOrder(order: OrderRow): Order {
    return {
        id: order.id,
        planName: order.planName,
        kind: order.kind,
        period: order.period,
        status: order.status,
        amountMinor: order.amountMinor,
        creditMinor: order.creditMinor,
        discountMinor: order.discountMinor,
        replacesPlan: order.replacesPlan,
        payableMinor: payableAmount(order),
        transferBytes: order.transferBytes.toString(),
        durationDays: order.durationDays,
        createdAt: order.createdAt.toISOString(),
        expiresAt: order.expiresAt.toISOString(),
    };
}

function priceOnSale(
    plan: Awaited<ReturnType<typeof orderPlan>>,
    period: Period,
) {
    const price = plan.prices.find((p) => p.period === period);
    if (
        !plan.published ||
        !price ||
        price.currency !== "CNY" ||
        price.amountMinor <= 0
    )
        throw badRequest("该套餐或付款周期不可购买。");
    return price.amountMinor;
}

function resetPrice(
    user: User,
    plan: Awaited<ReturnType<typeof orderPlan>>,
    now: Date,
) {
    if (user.planId !== plan.id || !hasActivePlan(user, now))
        throw conflict("仅可为当前有效套餐购买流量重置包。");
    if (plan.trafficResetPriceMinor === null)
        throw badRequest("该套餐未提供流量重置包。");
    return plan.trafficResetPriceMinor;
}

export async function createOrder(
    userId: number,
    input: CreateOrderBody,
    actorId?: number,
    transaction?: Tx,
): Promise<Order> {
    const create = async (tx: Tx) => {
        const user = await lockBuyer(tx, userId);
        // Retrying the same purchase returns the order it already created.
        const existing = await tx.order.findUnique({
            where: { userId_requestId: { userId, requestId: input.requestId } },
            include: { coupon: { select: { code: true } } },
        });
        if (existing) {
            if (
                existing.planId !== input.planId ||
                existing.kind !== (input.kind ?? "subscription") ||
                existing.period !==
                    (input.kind === "traffic_reset" ? null : input.period) ||
                existing.coupon?.code !==
                    (input.kind === "traffic_reset"
                        ? undefined
                        : input.couponCode)
            )
                throw conflict("同一请求编号不能用于不同订单。");
            return toOrder(existing);
        }
        const now = new Date();
        await expirePendingOrders(tx, now, userId);
        if (await tx.order.findFirst({ where: { userId, status: "pending" } }))
            throw conflict("请先支付或取消待支付订单。");
        const plan = await orderPlan(tx, input.planId);
        const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MS);
        const base = {
            userId,
            planId: plan.id,
            requestId: input.requestId,
            planName: plan.name,
            expiresAt,
        };
        if (input.kind === "traffic_reset") {
            const amountMinor = resetPrice(user, plan, now);
            const order = await tx.order.create({
                data: {
                    ...base,
                    kind: "traffic_reset",
                    amountMinor,
                    transferBytes: 0n,
                    durationDays: 0,
                    entitlementVersion: user.entitlementVersion,
                },
            });
            if (actorId !== undefined)
                await audit(tx, actorId, "order.create", order.id, {
                    userId,
                    planId: plan.id,
                });
            await enqueueTelegram(
                tx,
                `order:${order.id}`,
                `新订单 ${order.id} · ${order.planName}`,
            );
            return toOrder(order);
        }
        const amountMinor = priceOnSale(plan, input.period);
        const switching =
            purchaseType(user, plan.id, now, input.period) === "switch";
        // A permanent plan (no expiry) has no remaining time to value, so
        // switching away from it earns no credit.
        const creditMinor =
            switching && user.expiredAt !== null
                ? await remainingPlanCredit(tx, user, now)
                : 0;
        const coupon = input.couponCode
            ? await availableCoupon(tx, userId, { code: input.couponCode })
            : null;
        const discountMinor = coupon
            ? Math.min(
                  coupon.amountMinor,
                  Math.max(0, amountMinor - creditMinor),
              )
            : 0;
        if (coupon && discountMinor === 0)
            throw badRequest("该订单无需扣款，请移除优惠码。");
        const order = await tx.order.create({
            data: {
                ...base,
                ...planSnapshot(plan, input.period),
                amountMinor,
                creditMinor,
                ...(coupon && { couponId: coupon.id, discountMinor }),
                ...(switching && {
                    replacesPlan: true,
                    priorExpiresAt: user.expiredAt,
                    entitlementVersion: user.entitlementVersion,
                }),
            },
        });
        if (actorId !== undefined)
            await audit(tx, actorId, "order.create", order.id, {
                userId,
                planId: plan.id,
            });
        await enqueueTelegram(
            tx,
            `order:${order.id}`,
            `新订单 ${order.id} · ${order.planName}`,
        );
        return toOrder(order);
    };
    return transaction ? create(transaction) : db.$transaction(create);
}

/**
 * Cancel pending orders whose payment window has passed (all users, or one),
 * with one `order.expire` audit row per order. Actor 0 is the system.
 */
export async function expirePendingOrders(
    tx: Tx,
    now: Date,
    userId?: number,
): Promise<number> {
    const expired = await tx.$queryRaw<
        { id: string; userId: number; planId: number }[]
    >`
        UPDATE "Order" SET status = 'cancelled'
        WHERE status = 'pending' AND "expiresAt" <= ${now.toISOString()}::timestamp(3)
          AND (${userId ?? null}::int IS NULL OR "userId" = ${userId ?? null}::int)
        RETURNING id::text AS id, "userId", "planId"`;
    if (expired.length)
        await tx.audit.createMany({
            data: expired.map((order) => ({
                actorId: 0,
                action: "order.expire",
                target: order.id,
                detail: { userId: order.userId, planId: order.planId },
            })),
        });
    return expired.length;
}

export async function listOrders(userId: number): Promise<Order[]> {
    const orders = await db.order.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
    });
    return orders.map(toOrder);
}

export async function cancelOrder(userId: number, id: string): Promise<Order> {
    return db.$transaction(async (tx) => {
        await lockBuyer(tx, userId);
        const order = await tx.order.findFirst({ where: { id, userId } });
        if (!order) throw notFound("订单不存在。");
        if (order.status === "cancelled") return toOrder(order);
        if (order.status !== "pending")
            throw conflict("订单状态已改变，请刷新。");
        const cancelled = await tx.order.update({
            where: { id },
            data: { status: "cancelled" },
        });
        await audit(tx, userId, "order.cancel", id, {
            planId: order.planId,
            kind: order.kind,
        });
        return toOrder(cancelled);
    });
}

export function payOrder(userId: number, id: string): Promise<Order> {
    return db.$transaction((tx) => settleOrder(tx, userId, id));
}

export async function confirmOfflinePayment(
    tx: Tx,
    actorId: number,
    id: string,
    input: OfflineOrderPaymentBody,
): Promise<Order> {
    const order = await tx.order.findUnique({
        where: { id },
        select: { userId: true },
    });
    if (!order) throw notFound("订单不存在。");
    return settleOrder(tx, order.userId, id, {
        actorId,
        amountMinor: input.amountMinor,
        reason: input.reason || "确认线下收款",
    });
}

/** Settle against the original quote under the same locks for both payment methods. */
export async function settleOrder(
    tx: Tx,
    userId: number,
    id: string,
    receipt?: OfflineReceipt,
): Promise<Order> {
    const user = await lockBuyer(tx, userId);
    // The maintenance expiry task also changes order rows.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid AND "userId" = ${userId} FOR UPDATE`;
    const order = await tx.order.findFirst({ where: { id, userId } });
    if (!order) throw notFound("订单不存在。");
    if (order.status === "paid") {
        if (receipt) {
            const prior = await tx.audit.findFirst({
                where: {
                    action: OFFLINE_PAYMENT_ACTION,
                    target: order.id,
                    actorId: receipt.actorId,
                    AND: [
                        {
                            detail: {
                                path: ["amountMinor"],
                                equals: receipt.amountMinor,
                            },
                        },
                        {
                            detail: {
                                path: ["reason"],
                                equals: receipt.reason,
                            },
                        },
                    ],
                },
                select: { id: true },
            });
            if (!prior) throw conflict("订单已结算，请刷新订单列表。");
        }
        return toOrder(order);
    }
    if (order.status !== "pending") throw conflict("订单状态已改变，请刷新。");
    const plan = await orderPlan(tx, order.planId);
    const now = new Date();
    if (order.expiresAt <= now)
        throw conflict("订单已超时，请取消后重新下单。");
    const payableMinor = payableAmount(order);
    if (receipt && (payableMinor <= 0 || receipt.amountMinor !== payableMinor))
        throw conflict("实收金额须与订单应付金额一致，且大于 0 元。");
    const balanceDebit = receipt ? 0 : payableMinor;
    if (user.balance < balanceDebit)
        throw badRequest("余额不足，请选择其他可用的支付方式。");
    if (balanceDebit < 0 && user.balance - balanceDebit > MAX_BALANCE_MINOR)
        throw conflict("退回差额后余额将超过上限，请联系管理员。");
    let paidSnapshot: Pick<OrderRow, "serviceUntil" | "entitlementVersion">;
    if (order.kind === "traffic_reset") {
        resetPrice(user, plan, now);
        if (order.entitlementVersion !== user.entitlementVersion)
            throw conflict("当前套餐已变更，请取消后重新下单。");
        // A due automatic reset below zeroes `user` in place; record what the
        // account had used before either reset.
        const usedBefore = {
            upload: user.upload.toString(),
            download: user.download.toString(),
        };
        await resetDueTraffic(tx, [user], now);
        await tx.user.update({
            where: { id: userId },
            data: { balance: { decrement: balanceDebit }, ...clearUsage },
        });
        await tx.audit.create({
            data: {
                actorId: receipt?.actorId ?? userId,
                action: "traffic.paid_reset",
                target: String(userId),
                detail: {
                    orderId: id,
                    ...usedBefore,
                },
            },
        });
        paidSnapshot = {
            serviceUntil: null,
            entitlementVersion: order.entitlementVersion,
        };
    } else {
        priceOnSale(plan, order.period!);
        if (order.couponId !== null)
            await availableCoupon(tx, userId, { id: order.couponId });
        const purchase = purchaseType(user, plan.id, now, order.period!);
        if (
            (purchase === "switch") !== order.replacesPlan ||
            (order.replacesPlan &&
                (order.entitlementVersion !== user.entitlementVersion ||
                    (order.priorExpiresAt?.getTime() ?? null) !==
                        (user.expiredAt?.getTime() ?? null)))
        )
            throw conflict("当前套餐已变更，请取消后重新下单。");
        paidSnapshot = await applyTerm(
            tx,
            user,
            order,
            purchase === "renewal",
            now,
            balanceDebit,
        );
    }
    const payment = await tx.balanceEntry.create({
        data: {
            userId,
            orderId: id,
            actorId: receipt?.actorId,
            amountMinor: -payableMinor,
            reason: receipt
                ? "线下收款结算"
                : order.kind === "traffic_reset"
                  ? "购买流量重置包"
                  : order.replacesPlan
                    ? "套餐更换结算"
                    : null,
        },
    });
    if (receipt) {
        // The receipt is credited and spent in the same transaction. Only
        // the journal entries move, so the account's existing balance stays intact.
        const credit = await tx.balanceEntry.create({
            data: {
                userId,
                actorId: receipt.actorId,
                amountMinor: payableMinor,
                reason: `线下收款（订单 ${order.id}）`,
            },
        });
        await audit(tx, receipt.actorId, OFFLINE_PAYMENT_ACTION, order.id, {
            userId,
            amountMinor: payableMinor,
            reason: receipt.reason,
            creditEntryId: credit.id,
            paymentEntryId: payment.id,
        });
    }
    const settled = await tx.order.update({
        where: { id },
        data: { status: "paid", paidAt: now, ...paidSnapshot },
    });
    await awardCommission(tx, user, settled, payableMinor);
    return toOrder(settled);
}
