import type { Order, Plan, User } from "@prisma/client";
import type { Period } from "@xboard/contracts";
import { lockUser, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { hasActivePlan } from "../account/entitlement";
import {
    clearUsage,
    resetDueTraffic,
    trafficSchedule,
} from "../account/traffic-cycle";
import { DAY_MS } from "./credit";

const DURATION_DAYS: Record<Period, number> = {
    monthly: 30,
    quarterly: 90,
    half_yearly: 180,
    yearly: 365,
    two_yearly: 730,
    three_yearly: 1095,
    onetime: 0,
};

export async function lockBuyer(tx: Tx, userId: number) {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("用户不存在。");
    if (user.banned) throw conflict("账户不可用。");
    return user;
}

export function purchaseType(
    user: User,
    planId: number,
    now: Date,
    period: Period,
) {
    if (!hasActivePlan(user, now)) return "new";
    if (user.planId !== planId) return "switch";
    // A permanent plan has nothing to extend; other plans can still be chosen.
    if (user.expiredAt === null)
        throw conflict(
            "当前套餐长期有效，无需续费。如需调整，可更换为其他套餐。",
        );
    return period === "onetime" ? "switch" : "renewal";
}

/** Reminder bits already passed: 1 for 80% of the quota, 2 for 95%. */
export function trafficReminderMask(used: bigint, quota: bigint) {
    if (quota <= 0n) return 0;
    return (
        (used * 100n >= quota * 80n ? 1 : 0) |
        (used * 100n >= quota * 95n ? 2 : 0)
    );
}

export async function orderPlan(tx: Tx, planId: number) {
    // Keep the plan stable through the order snapshot or entitlement update.
    await tx.$queryRaw`SELECT id FROM "Plan" WHERE id = ${planId} FOR SHARE`;
    const plan = await tx.plan.findUnique({
        where: { id: planId },
        include: { prices: true },
    });
    if (!plan || plan.deletedAt !== null || plan.transferEnable <= 0n)
        throw badRequest("该套餐已不可用。");
    return plan;
}

export function planSnapshot(plan: Plan, period: Period) {
    return {
        planId: plan.id,
        planName: plan.name,
        period,
        transferBytes: plan.transferEnable,
        speedLimit: plan.speedLimit,
        deviceLimit: plan.deviceLimit,
        durationDays: DURATION_DAYS[period],
        trafficResetMode: plan.trafficResetMode,
    };
}

type Term = Pick<
    Order,
    | "planId"
    | "durationDays"
    | "period"
    | "trafficResetMode"
    | "transferBytes"
    | "speedLimit"
    | "deviceLimit"
>;

/** Install paid or gifted subscription terms while the account is locked. */
export async function applyTerm(
    tx: Tx,
    user: User,
    term: Term,
    renewal: boolean,
    now: Date,
    payableMinor = 0,
) {
    await resetDueTraffic(tx, [user], now);
    const start = renewal ? user.expiredAt!.getTime() : now.getTime();
    const serviceUntil =
        term.period === "onetime"
            ? null
            : new Date(start + term.durationDays * DAY_MS);
    const entitlementVersion = user.entitlementVersion + (renewal ? 0 : 1);
    const transferEnable =
        renewal &&
        term.trafficResetMode === "none" &&
        user.trafficResetMode === "none"
            ? user.transferEnable + term.transferBytes
            : term.transferBytes;
    if (transferEnable > 9_223_372_036_854_775_807n)
        throw conflict("续费后流量超过上限，请联系管理员。");
    await tx.user.update({
        where: { id: user.id },
        data: {
            ...(payableMinor !== 0 && { balance: { decrement: payableMinor } }),
            planId: term.planId,
            expiredAt: serviceUntil,
            entitlementVersion,
            expiryReminderMask: 0,
            ...(renewal
                ? {
                      // Stacked quota lowers the usage share; the 80% / 95%
                      // mails must be able to fire again from the new total.
                      trafficReminderMask: trafficReminderMask(
                          user.upload + user.download,
                          transferEnable,
                      ),
                  }
                : clearUsage),
            ...(renewal && term.trafficResetMode === user.trafficResetMode
                ? {}
                : trafficSchedule(term.trafficResetMode, now)),
            transferEnable,
            speedLimit: term.speedLimit,
            deviceLimit: term.deviceLimit,
        },
    });
    return { serviceUntil, entitlementVersion };
}
