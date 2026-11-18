import type { Order as OrderRow, User } from "@prisma/client";
import type { CreateOrderBody, Order, Period } from "@xboard/contracts";
import { db, lockUser, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { hasActivePlan } from "../account/entitlement";

const DURATION_DAYS: Record<Period, number> = {
    monthly: 30,
    quarterly: 90,
    yearly: 365,
};
const PAYMENT_WINDOW_MS = 30 * 60_000;
const DAY_MS = 86_400_000;

function toOrder(order: OrderRow): Order {
    return {
        id: order.id,
        planName: order.planName,
        period: order.period,
        status: order.status,
        amountMinor: order.amountMinor,
        transferBytes: order.transferBytes.toString(),
        durationDays: order.durationDays,
        createdAt: order.createdAt.toISOString(),
        expiresAt: order.expiresAt.toISOString(),
    };
}

/**
 * Every order change for a user takes this row lock, so concurrent payments
 * cannot debit twice or overwrite each other's entitlement.
 */
async function lockBuyer(tx: Tx, userId: number) {
    await lockUser(tx, userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.banned) throw conflict("账户不可用。");
    return user;
}

/** Returns true when the purchase renews the current plan. */
function checkPurchase(user: User, planId: number): boolean {
    const active = hasActivePlan(user);
    if (active && user.planId !== planId)
        throw conflict("当前套餐仍有效，请在到期后更换套餐。");
    if (active && user.expiredAt === null) throw conflict("长期套餐无需续费。");
    return active;
}

/** The plan's current price for a period, or 400 when it is no longer for sale. */
async function priceOnSale(tx: Tx, planId: number, period: Period) {
    const plan = await tx.plan.findUnique({
        where: { id: planId },
        include: { prices: true },
    });
    const price = plan?.prices.find((p) => p.period === period);
    if (
        !plan ||
        !plan.published ||
        plan.deletedAt !== null ||
        !price ||
        price.currency !== "CNY" ||
        price.amountMinor < 0 ||
        plan.transferEnable <= 0n
    )
        throw badRequest("该套餐或付款周期不可购买。");
    return { plan, price };
}

export async function createOrder(
    userId: number,
    input: CreateOrderBody,
): Promise<Order> {
    return db.$transaction(async (tx) => {
        const user = await lockBuyer(tx, userId);
        // Retrying the same purchase returns the order it already created.
        const existing = await tx.order.findUnique({
            where: { userId_requestId: { userId, requestId: input.requestId } },
        });
        if (existing) {
            if (
                existing.planId !== input.planId ||
                existing.period !== input.period
            )
                throw conflict("同一请求编号不能用于不同订单。");
            return toOrder(existing);
        }
        checkPurchase(user, input.planId);
        await tx.order.updateMany({
            where: {
                userId,
                status: "pending",
                expiresAt: { lte: new Date() },
            },
            data: { status: "cancelled" },
        });
        if (await tx.order.findFirst({ where: { userId, status: "pending" } }))
            throw conflict("请先支付或取消待支付订单。");
        const { plan, price } = await priceOnSale(
            tx,
            input.planId,
            input.period,
        );
        const order = await tx.order.create({
            data: {
                userId,
                planId: plan.id,
                requestId: input.requestId,
                planName: plan.name,
                period: input.period,
                amountMinor: price.amountMinor,
                transferBytes: plan.transferEnable,
                speedLimit: plan.speedLimit,
                deviceLimit: plan.deviceLimit,
                durationDays: DURATION_DAYS[input.period],
                expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
            },
        });
        return toOrder(order);
    });
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
        return toOrder(
            await tx.order.update({
                where: { id },
                data: { status: "cancelled" },
            }),
        );
    });
}

/** Pay from balance. The order keeps the price it was created with. */
export async function payOrder(userId: number, id: string): Promise<Order> {
    return db.$transaction(async (tx) => {
        const user = await lockBuyer(tx, userId);
        const order = await tx.order.findFirst({ where: { id, userId } });
        if (!order) throw notFound("订单不存在。");
        if (order.status === "paid") return toOrder(order);
        if (order.status !== "pending")
            throw conflict("订单状态已改变，请刷新。");
        if (order.expiresAt <= new Date())
            throw conflict("订单已超时，请取消后重新下单。");
        // The plan may have been unpublished or deleted after the order was placed.
        await priceOnSale(tx, order.planId, order.period);
        const renewal = checkPurchase(user, order.planId);
        if (user.balance < order.amountMinor)
            throw badRequest("余额不足，暂未开放在线充值。");
        const start = renewal ? user.expiredAt!.getTime() : Date.now();
        await tx.user.update({
            where: { id: userId },
            data: {
                balance: { decrement: order.amountMinor },
                planId: order.planId,
                expiredAt: new Date(start + order.durationDays * DAY_MS),
                // Quota belongs to the term: a renewal adds quota and time, a new plan starts over.
                transferEnable: renewal
                    ? user.transferEnable + order.transferBytes
                    : order.transferBytes,
                upload: renewal ? user.upload : 0n,
                download: renewal ? user.download : 0n,
                speedLimit: order.speedLimit,
                deviceLimit: order.deviceLimit,
            },
        });
        await tx.balanceEntry.create({
            data: { userId, orderId: id, amountMinor: -order.amountMinor },
        });
        return toOrder(
            await tx.order.update({
                where: { id },
                data: { status: "paid", paidAt: new Date() },
            }),
        );
    });
}
