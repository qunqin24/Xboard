import nodemailer from "nodemailer";
import { getConfig, getSmtpConfig } from "../config";
import { db } from "../db";
import { errorFields, log, reportJobFailure } from "../logging";

export const MAX_MAIL_ATTEMPTS = 5;
const BATCH = 5;
let busy = false;

/**
 * Send due mail. Rows are claimed with SKIP LOCKED so several API instances
 * never send the same mail; a failure is retried after 2, 4, 8… minutes and
 * its reason is kept in `lastError`. A sent mail's body (it holds a one-time
 * link) is cleared.
 */
export async function flushMail() {
    const smtp = getSmtpConfig();
    if (!smtp || busy) return;
    busy = true;
    const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        // Production refuses to send links over an unencrypted connection.
        requireTLS: getConfig().production && !smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
    });
    try {
        const now = new Date();
        const jobs = await db.$transaction(async (tx) => {
            // Compare against a UTC parameter, not NOW(): columns are UTC timestamps
            // without zone, and NOW() would follow the database session's time zone.
            const rows = await tx.$queryRaw<Array<{ id: number }>>`
                SELECT id FROM "Mail"
                WHERE "sentAt" IS NULL AND attempts < ${MAX_MAIL_ATTEMPTS}
                  AND "nextAttempt" <= ${now.toISOString()}::timestamp(3)
                ORDER BY id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`;
            const claimed = [];
            for (const row of rows)
                claimed.push(
                    await tx.mail.update({
                        where: { id: row.id },
                        // Held for 2 minutes in case this process dies mid-send.
                        data: {
                            attempts: { increment: 1 },
                            nextAttempt: new Date(now.getTime() + 120_000),
                        },
                    }),
                );
            return claimed;
        });
        const hostname = new URL(getConfig().origin).hostname;
        for (const mail of jobs) {
            try {
                await transport.sendMail({
                    from: smtp.from,
                    to: mail.to,
                    subject: mail.subject,
                    text: mail.text,
                    messageId: `<xboard-${mail.id}@${hostname}>`,
                });
                await db.mail.update({
                    where: { id: mail.id },
                    data: { sentAt: new Date(), text: "", lastError: null },
                });
            } catch (error) {
                const details = errorFields(error);
                const responseCode =
                    error instanceof Error &&
                    "responseCode" in error &&
                    typeof error.responseCode === "number"
                        ? error.responseCode
                        : null;
                const reason = [details.code ?? details.type, responseCode]
                    .filter(Boolean)
                    .join(" ");
                if (mail.attempts >= MAX_MAIL_ATTEMPTS)
                    reportJobFailure("mail delivery", error, {
                        mailId: mail.id,
                        attempts: mail.attempts,
                    });
                else
                    log("warn", "mail.retry", {
                        mailId: mail.id,
                        attempt: mail.attempts,
                        error: details,
                    });
                await db.mail.update({
                    where: { id: mail.id },
                    data: {
                        lastError: reason.slice(0, 500),
                        nextAttempt: new Date(
                            Date.now() + 60_000 * 2 ** mail.attempts,
                        ),
                    },
                });
            }
        }
    } catch (error) {
        reportJobFailure("mail queue", error);
    } finally {
        transport.close();
        busy = false;
    }
}
