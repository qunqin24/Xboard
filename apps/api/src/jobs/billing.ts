import { Prisma, type User } from "@prisma/client";
import { getConfig, getSmtpConfig } from "../config";
import { db } from "../db";
import {
    resetDueTraffic,
    type CycleUser,
} from "../modules/account/traffic-cycle";
import { DAY_MS } from "../modules/orders/credit";
import { readSettings } from "../modules/site/service";
import { readTemplates, renderTemplate } from "../modules/mail/templates";

const BATCH_SIZE = 100;

export async function runMonthlyResets(now: Date) {
    const stamp = now.toISOString();
    for (;;) {
        const count = await db.$transaction(async (tx) => {
            const users = await tx.$queryRaw<CycleUser[]>`
                SELECT id, "planId", "expiredAt", upload, download, "nextTrafficResetAt", "trafficResetDay"
                FROM "User"
                WHERE "nextTrafficResetAt" <= ${stamp}::timestamp(3) AND "planId" IS NOT NULL
                  AND ("expiredAt" IS NULL OR "expiredAt" > ${stamp}::timestamp(3))
                ORDER BY "nextTrafficResetAt", id LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED`;
            await resetDueTraffic(tx, users, now);
            return users.length;
        });
        if (count < BATCH_SIZE) return;
    }
}

type ReminderUser = Pick<
    User,
    "id" | "email" | "expiryReminderMask" | "trafficReminderMask"
> & { expiredAt: Date; expiryStage: number; trafficStages: number };

export async function queueBillingReminders(now: Date) {
    if (!getSmtpConfig()) return;
    const { expiryReminders, trafficReminders, siteName } =
        await readSettings();
    if (!expiryReminders && !trafficReminders) return;
    const [expiryTemplate, trafficTemplate] = await readTemplates([
        "expiry_reminder",
        "traffic_reminder",
    ]);
    const stamp = now.toISOString();
    const oneDay = new Date(now.getTime() + DAY_MS).toISOString();
    const threeDays = new Date(now.getTime() + 3 * DAY_MS).toISOString();
    const link = `${getConfig().origin}/plans`;
    const expiryStage = expiryReminders
        ? Prisma.sql`CASE WHEN "expiredAt" <= ${oneDay}::timestamp(3) THEN 2
                          WHEN "expiredAt" <= ${threeDays}::timestamp(3) THEN 1 ELSE 0 END`
        : Prisma.sql`0`;
    const trafficStages = trafficReminders
        ? Prisma.sql`CASE
            WHEN "transferEnable" = 0 OR "nextTrafficResetAt" <= ${stamp}::timestamp(3) THEN 0
            WHEN (upload::numeric + download) * 100 >= "transferEnable"::numeric * 95 THEN 3
            WHEN (upload::numeric + download) * 100 >= "transferEnable"::numeric * 80 THEN 1
            ELSE 0 END`
        : Prisma.sql`0`;

    for (;;) {
        const count = await db.$transaction(
            async (tx) => {
                const users = await tx.$queryRaw<ReminderUser[]>`
                SELECT id, email, "expiredAt", "expiryReminderMask", "trafficReminderMask",
                       ${expiryStage} AS "expiryStage", ${trafficStages} AS "trafficStages"
                FROM "User"
                WHERE NOT banned AND "planId" IS NOT NULL
                  AND ("expiredAt" IS NULL OR "expiredAt" > ${stamp}::timestamp(3))
                  AND ((${expiryStage} & ~"expiryReminderMask") <> 0
                    OR (${trafficStages} & ~"trafficReminderMask") <> 0)
                ORDER BY id LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED`;
                for (const user of users) {
                    const expiry = user.expiryStage & ~user.expiryReminderMask;
                    const traffic =
                        user.trafficStages & ~user.trafficReminderMask;
                    const mail = [];
                    if (expiry) {
                        // The real time left, rounded up: "1 day" only inside the last day.
                        const days = Math.min(
                            3,
                            Math.max(
                                1,
                                Math.ceil(
                                    (user.expiredAt.getTime() - now.getTime()) /
                                        DAY_MS,
                                ),
                            ),
                        );
                        mail.push(
                            renderTemplate(expiryTemplate!, {
                                siteName,
                                days,
                                link,
                            }),
                        );
                    }
                    // Usage can jump past both thresholds at once; one mail for the
                    // highest stage is enough, and both stages are marked done below.
                    if (traffic)
                        mail.push(
                            renderTemplate(trafficTemplate!, {
                                siteName,
                                percent: traffic & 2 ? 95 : 80,
                                link,
                            }),
                        );
                    await tx.mail.createMany({
                        data: mail.map((message) => ({
                            ...message,
                            to: user.email,
                        })),
                    });
                    await tx.user.update({
                        where: { id: user.id },
                        data: {
                            // The last-day stage implies the 3-day stage.
                            expiryReminderMask:
                                user.expiryReminderMask |
                                (user.expiryStage === 2 ? 3 : user.expiryStage),
                            trafficReminderMask:
                                user.trafficReminderMask | user.trafficStages,
                        },
                    });
                }
                return users.length;
            },
            { timeout: 20_000 },
        );
        if (count < BATCH_SIZE) return;
    }
}
