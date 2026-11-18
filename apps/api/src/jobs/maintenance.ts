import { db } from "../db";
import { reportJobFailure } from "../logging";
import { queueBillingReminders, runMonthlyResets } from "./billing";
import { expirePendingOrders } from "../modules/orders/service";
import { MAX_MAIL_ATTEMPTS } from "./mail-queue";

const DAY = 86_400_000;

/**
 * Each cleanup runs on its own, so one failing task (a lock timeout, say)
 * neither rolls back nor blocks the others. Failures are logged by name.
 */
function tasks(now: Date) {
    const ago = (ms: number) => new Date(now.getTime() - ms);
    return {
        "reset monthly traffic": () => runMonthlyResets(now),
        "queue subscription reminders": () => queueBillingReminders(now),
        "expire pending orders": () =>
            db.$transaction((tx) => expirePendingOrders(tx, now)),
        "delete expired sessions": () =>
            db.session.deleteMany({ where: { expiresAt: { lte: now } } }),
        "delete expired email links": () =>
            db.emailToken.deleteMany({ where: { expiresAt: { lte: now } } }),
        // Kept a day past expiry so the resend cooldown still sees them.
        "delete old sign-up codes": () =>
            db.registerCode.deleteMany({
                where: { expiresAt: { lt: ago(DAY) } },
            }),
        "forget offline devices": () =>
            db.onlineDevice.deleteMany({
                where: { seenAt: { lt: ago(180_000) } },
            }),
        "drop finished rate limits": () =>
            db.rateLimit.deleteMany({
                where: {
                    expiresAt: { lt: now },
                    OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
                },
            }),
        "delete week-old mail": () =>
            db.mail.deleteMany({
                where: {
                    OR: [
                        { sentAt: { lt: ago(7 * DAY) } },
                        {
                            sentAt: null,
                            attempts: { gte: MAX_MAIL_ATTEMPTS },
                            nextAttempt: { lt: ago(7 * DAY) },
                        },
                    ],
                },
            }),
        "delete old traffic receipts": () =>
            db.trafficReceipt.deleteMany({
                where: { createdAt: { lt: ago(30 * DAY) } },
            }),
        // Statistics look back at most 180 days; older per-report rows only grow the table.
        "delete traffic older than 180 days": () =>
            db.trafficRecord.deleteMany({
                where: { createdAt: { lt: ago(180 * DAY) } },
            }),
    };
}

let busy = false;

/** Returns the names of the tasks that failed. */
export async function runMaintenance(now = new Date()): Promise<string[]> {
    if (busy) return [];
    busy = true;
    const failed: string[] = [];
    try {
        for (const [name, run] of Object.entries(tasks(now))) {
            try {
                await run();
            } catch (error) {
                failed.push(name);
                reportJobFailure(name, error);
            }
        }
    } finally {
        busy = false;
    }
    return failed;
}
