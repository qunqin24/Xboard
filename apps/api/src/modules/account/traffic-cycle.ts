import type { TrafficResetMode, User } from "@prisma/client";
import { type Tx } from "../../db";
import { hasActivePlan } from "./entitlement";

const SHANGHAI_OFFSET = 8 * 60 * 60_000;

function localDate(date: Date) {
    return new Date(date.getTime() + SHANGHAI_OFFSET);
}

function beijingMidnight(year: number, month: number, day: number) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(year, month, Math.min(day, daysInMonth)) - SHANGHAI_OFFSET;
}

/** Next Beijing midnight on the original billing day, clamped in short months. */
export function nextMonthlyReset(now: Date, day: number): Date {
    const local = localDate(now);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const current = beijingMidnight(year, month, day);
    return new Date(
        current > now.getTime()
            ? current
            : beijingMidnight(year, month + 1, day),
    );
}

function nextReset(now: Date, day: number, month: number | null) {
    if (month === null) return nextMonthlyReset(now, day);
    const year = localDate(now).getUTCFullYear();
    const current = beijingMidnight(year, month - 1, day);
    return new Date(
        current > now.getTime()
            ? current
            : beijingMidnight(year + 1, month - 1, day),
    );
}

export function trafficSchedule(mode: TrafficResetMode, start: Date) {
    const local = localDate(start);
    const day =
        mode === "month_start" || mode === "year_start"
            ? 1
            : local.getUTCDate();
    const month =
        mode === "year_start"
            ? 1
            : mode === "activation_anniversary"
              ? local.getUTCMonth() + 1
              : null;
    return {
        trafficResetMode: mode,
        trafficResetDay: mode === "none" ? null : day,
        trafficResetMonth: month,
        nextTrafficResetAt:
            mode === "none" ? null : nextReset(start, day, month),
    };
}

export const clearUsage = {
    upload: 0n,
    download: 0n,
    trafficReminderMask: 0,
};

export type CycleUser = Pick<
    User,
    | "id"
    | "planId"
    | "expiredAt"
    | "upload"
    | "download"
    | "nextTrafficResetAt"
    | "trafficResetDay"
    | "trafficResetMonth"
>;

/**
 * Call with the affected user rows locked. Advancing the schedule in the same
 * transaction as clearing usage lets reporting and maintenance share the job.
 */
export async function resetDueTraffic(tx: Tx, users: CycleUser[], now: Date) {
    const due = users.flatMap((user) => {
        const scheduledAt = user.nextTrafficResetAt;
        if (
            !hasActivePlan(user, now) ||
            scheduledAt === null ||
            scheduledAt > now ||
            user.trafficResetDay === null
        )
            return [];
        return [
            {
                user,
                scheduledAt,
                next: nextReset(
                    now,
                    user.trafficResetDay,
                    user.trafficResetMonth,
                ),
            },
        ];
    });
    if (!due.length) return;

    await tx.$executeRaw`
        UPDATE "User" AS u
        SET upload = 0, download = 0, "trafficReminderMask" = 0,
            "nextTrafficResetAt" = t.next_at, "updatedAt" = ${now.toISOString()}::timestamp(3)
        FROM unnest(
            ${due.map(({ user }) => user.id)}::int[],
            ${due.map(({ next }) => next.toISOString())}::text[]::timestamp(3)[]
        ) AS t(id, next_at)
        WHERE u.id = t.id`;
    await tx.audit.createMany({
        data: due.map(({ user, scheduledAt, next }) => ({
            actorId: 0,
            action:
                user.trafficResetMonth === null
                    ? "traffic.monthly_reset"
                    : "traffic.annual_reset",
            target: String(user.id),
            detail: {
                scheduledAt: scheduledAt.toISOString(),
                nextAt: next.toISOString(),
                upload: user.upload.toString(),
                download: user.download.toString(),
            },
        })),
    });
    for (const { user, next } of due) {
        user.nextTrafficResetAt = next;
        user.upload = 0n;
        user.download = 0n;
    }
}
