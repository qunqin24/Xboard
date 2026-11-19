import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { it } from "node:test";
import { db } from "../src/db";
import { checkOfflineNodes } from "../src/jobs/node-monitor";
import { sealApplicationSecret } from "../src/modules/system/secrets";
import { startTestApp } from "./helpers";

it("retries delivery and alerts once per offline episode across workers", async () => {
    const app = await startTestApp();
    const deliveries: { event: string; nodes: { id: number }[] }[] = [];
    let status = 503;
    const server = createServer(async (req, res) => {
        const parts: Buffer[] = [];
        for await (const part of req) parts.push(part);
        deliveries.push(JSON.parse(Buffer.concat(parts).toString()));
        res.writeHead(status).end();
    });
    try {
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        await db.setting.create({
            data: {
                key: "alertWebhookUrl",
                value: sealApplicationSecret(
                    "setting:alertWebhookUrl",
                    Buffer.from(`http://127.0.0.1:${address.port}`),
                ),
            },
        });
        const now = new Date();
        const earlier = new Date(now.getTime() - 6 * 60_000);
        const base = {
            name: "fixture",
            protocol: "shadowsocks" as const,
            host: "node.example.test",
            port: 443,
            serverPort: 443,
            tokenHash: "fixture",
            enabled: true,
            createdAt: earlier,
            lastSeenAt: earlier,
        };
        const node = await db.node.create({ data: base });
        const newNode = await db.node.create({
            data: { ...base, lastSeenAt: null },
        });
        await db.node.createMany({
            data: [
                { ...base, parentId: node.id },
                { ...base, enabled: false },
                { ...base, deletedAt: earlier },
            ],
        });
        const online = await db.node.create({
            data: { ...base, lastSeenAt: now },
        });
        await checkOfflineNodes(now);
        status = 204;
        await Promise.all([checkOfflineNodes(now), checkOfflineNodes(now)]);
        await checkOfflineNodes(now);
        assert.equal(deliveries.length, 2);
        for (const alert of deliveries) {
            assert.equal(alert.event, "node.offline");
            assert.deepEqual(
                alert.nodes.map(({ id }) => id),
                [node.id, newNode.id],
            );
        }
        await db.node.update({
            where: { id: node.id },
            data: { lastSeenAt: new Date(now.getTime() + 1000) },
        });
        await checkOfflineNodes(new Date(now.getTime() + 1000));
        assert.equal(deliveries.length, 2);
        await checkOfflineNodes(new Date(now.getTime() + 6 * 60_000));
        assert.deepEqual(
            deliveries.at(-1)?.nodes.map(({ id }) => id),
            [node.id, online.id],
        );
    } finally {
        server.close();
        await app.stop();
    }
});
