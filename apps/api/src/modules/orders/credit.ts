import type { Order, User } from "@prisma/client";
import type { Tx } from "../../db";
import { badRequest } from "../../http/errors";
import { INT4_MAX } from "@xboard/contracts";

export const DAY_MS = 86_400_000;
export const MAX_BALANCE_MINOR = 2_000_000_000;

type Term = Pick<
    Order,
    | "id"
    | "durationDays"
    | "amountMinor"
    | "discountMinor"
    | "serviceUntil"
    | "paidAt"
>;

/** The unused value of one paid order, credited back on a plan switch. */
export type OrderCredit = {
    orderId: string;
    /** What the order's term was worth: price less discount. */
    valueMinor: number;
    creditMinor: number;
};

/**
 * Legacy renewals extended the expiry by the full order duration. Rebuild that
 * chain and use it only when its end matches the current subscription or the
 * beginning of its first tracked renewal. A manual or trial grant has no
 * purchase value, and a mismatched chain cannot establish that it was paid.
 */
function legacyTerms(orders: Term[], endsAt: number): Term[] {
    let end = 0;
    let terms: Term[] = [];
    for (const order of orders) {
        const paidAt = order.paidAt!.getTime();
        if (paidAt >= end) {
            end = paidAt;
            terms = [];
        }
        end += order.durationDays * DAY_MS;
        terms.push({ ...order, serviceUntil: new Date(end) });
    }
    const adjustment = endsAt - end;
    // The old payment wrote paidAt after computing the expiry.
    if (adjustment > 0 || adjustment < -5_000) return [];
    return terms.map((term) => ({
        ...term,
        serviceUntil: new Date(term.serviceUntil!.getTime() + adjustment),
    }));
}

export async function remainingPlanCredit(tx: Tx, user: User, now: Date) {
    const credits = await remainingCreditByOrder(tx, user, now);
    const total = credits.reduce(
        (sum, { creditMinor }) => sum + BigInt(creditMinor),
        0n,
    );
    if (total > BigInt(INT4_MAX))
        throw badRequest("套餐剩余价值超出订单上限，请联系管理员。");
    return Number(total);
}

/** remainingPlanCredit split by the orders it comes from. */
export async function remainingCreditByOrder(
    tx: Tx,
    user: User,
    now: Date,
): Promise<OrderCredit[]> {
    const expiry = user.expiredAt;
    if (!expiry || expiry <= now) return [];
    const orders = await tx.order.findMany({
        where: {
            userId: user.id,
            planId: user.planId!,
            kind: "subscription",
            durationDays: { gt: 0 },
            status: "paid",
            paidAt: { not: null },
            OR: [
                {
                    entitlementVersion: user.entitlementVersion,
                    serviceUntil: { gt: now },
                },
                ...(user.entitlementVersion === 0
                    ? [{ entitlementVersion: null }]
                    : []),
            ],
        },
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            amountMinor: true,
            discountMinor: true,
            durationDays: true,
            serviceUntil: true,
            paidAt: true,
        },
    });
    const tracked = orders.filter((order) => order.serviceUntil !== null);
    const legacyEnd = tracked[0]
        ? tracked[0].serviceUntil!.getTime() - tracked[0].durationDays * DAY_MS
        : expiry.getTime();
    const terms = [
        ...legacyTerms(
            orders.filter((order) => order.serviceUntil === null),
            legacyEnd,
        ),
        ...tracked,
    ];
    const credits: OrderCredit[] = [];
    for (const term of terms) {
        const end = term.serviceUntil!.getTime();
        const duration = term.durationDays * DAY_MS;
        const remaining =
            Math.min(end, expiry.getTime()) -
            Math.max(end - duration, now.getTime());
        if (remaining <= 0) continue;
        const valueMinor = term.amountMinor - term.discountMinor;
        credits.push({
            orderId: term.id,
            valueMinor,
            creditMinor: Number(
                (BigInt(valueMinor) * BigInt(remaining)) / BigInt(duration),
            ),
        });
    }
    return credits;
}
