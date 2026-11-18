import type { TrafficResetMode, User } from "@prisma/client";
import { type Tx } from "../../db";
import { hasActivePlan } from "./entitlement";

const SHANGHAI_OFFSET = 8 * 60 * 60_000;

/** Next Beijing midnight on the original billing day, clamped in short months. */
export function nextMonthlyReset(now: Date, day: number): Date {
    const local = new Date(now.getTime() + SHANGHAI_OFFSET);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const midnight = (m: number) =>
        Date.UTC(
            year,
            m,
            Math.min(day, new Date(Date.UTC(year, m + 1, 0)).getUTCDate()),
        ) - SHANGHAI_OFFSET;
    const current = midnight(month);
    return new Date(current > now.getTime() ? current : midnight(month + 1));
}

export function trafficSchedule(mode: TrafficResetMode, start: Date) {
    const day =
        mode === "month_start"
            ? 1
            : new Date(start.getTime() + SHANGHAI_OFFSET).getUTCDate();
    return {
        trafficResetMode: mode,
        trafficResetDay: mode === "none" ? null : day,
        nextTrafficResetAt:
            mode === "none" ? null : nextMonthlyReset(start, day),
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
                next: nextMonthlyReset(now, user.trafficResetDay),
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
            action: "traffic.monthly_reset",
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
