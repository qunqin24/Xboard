import { db } from "../db";
import { errorFields, log, sendAlertWebhook } from "../logging";
import { enqueueTelegram, telegramEnabled } from "../modules/telegram/service";
import { getSettingSecret } from "../modules/system/settings";

const offlineAfter = 5 * 60_000;

export async function checkOfflineNodes(now = new Date()) {
    try {
        const webhook = await getSettingSecret("alertWebhookUrl");
        if (!webhook && !(await telegramEnabled())) return;

        await db.$transaction(
            async (tx) => {
                const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
                SELECT pg_try_advisory_xact_lock(hashtext('xboard:node-monitor')) AS acquired
            `;
                if (!lock?.acquired) return;

                const cutoff = new Date(now.getTime() - offlineAfter);
                const nodes = await tx.$queryRaw<
                    { id: number; lastSeenAt: Date | null }[]
                >`
                SELECT "id", "lastSeenAt"
                FROM "Node"
                WHERE "enabled" AND "deletedAt" IS NULL AND "parentId" IS NULL
                  AND COALESCE("lastSeenAt", "createdAt") <= ${cutoff.toISOString()}::timestamp(3)
                  AND ("offlineAlertedAt" IS NULL OR "lastSeenAt" > "offlineAlertedAt")
                ORDER BY "id"
                LIMIT 100
            `;
                if (nodes.length === 0) return;

                for (const node of nodes) {
                    const lastSeen =
                        node.lastSeenAt?.toISOString() ?? "从未连接";
                    await enqueueTelegram(
                        tx,
                        `node.offline:${node.id}:${lastSeen}`,
                        `节点 #${node.id} 离线 · ${lastSeen}`,
                    );
                }
                if (webhook) {
                    try {
                        await sendAlertWebhook(webhook, {
                            event: "node.offline",
                            nodes,
                        });
                    } catch (error) {
                        log("warn", "node.monitor_failed", {
                            error: errorFields(error),
                        });
                        return;
                    }
                }
                // A heartbeat during delivery makes the next outage eligible again.
                await tx.node.updateMany({
                    where: { id: { in: nodes.map(({ id }) => id) } },
                    data: { offlineAlertedAt: now },
                });
            },
            { timeout: 10_000 },
        );
    } catch (error) {
        log("warn", "node.monitor_failed", { error: errorFields(error) });
    }
}
