import { Router } from "express";
import type { NodeProtocol } from "@prisma/client";
import { db } from "../../db";
import { badRequest, unauthorized } from "../../http/errors";
import {
    aliveCounts,
    authenticateNode,
    nodeUsers,
    parseNodeId,
    recordAlive,
    recordTraffic,
    saveStatus,
} from "./service";
import { nodeConfig, xrayStreamSettings } from "./node-config";
import { typedSettings, sniOf } from "./settings";

/** Node-facing API. Called by node software, not browsers; auth is node_id + token in the query. */
export const nodeRoutes = Router();

function idempotencyKey(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

// --- UniProxy (V2bX, XrayR UniProxy mode) ---

const uniProxy = "/v1/server/UniProxy";

nodeRoutes.get(`${uniProxy}/config`, async (req, res) => {
    res.json(nodeConfig(await authenticateNode(req.query)));
});

nodeRoutes.get(`${uniProxy}/user`, async (req, res) => {
    const node = await authenticateNode(req.query);
    res.json({ users: await nodeUsers(node.id) });
});

nodeRoutes.post(`${uniProxy}/push`, async (req, res) => {
    const node = await authenticateNode(req.query);
    res.status(201).json(
        await recordTraffic(
            node,
            req.body,
            idempotencyKey(req.headers["idempotency-key"]),
        ),
    );
});

nodeRoutes.post(`${uniProxy}/alive`, async (req, res) => {
    const node = await authenticateNode(req.query);
    res.status(201).json(await recordAlive(node.id, req.body));
});

nodeRoutes.get(`${uniProxy}/alivelist`, async (req, res) => {
    const node = await authenticateNode(req.query);
    res.json(await aliveCounts(node.id));
});

nodeRoutes.post(`${uniProxy}/status`, async (req, res) => {
    const node = await authenticateNode(req.query);
    res.status(201).json(await saveStatus(node.id, req.body));
});

// --- Legacy XrayR V2board adapters (Deepbwork / Tidalab) ---

const ADAPTERS: Record<string, NodeProtocol[]> = {
    Deepbwork: ["vmess", "vless"],
    TrojanTidalab: ["trojan"],
    ShadowsocksTidalab: ["shadowsocks"],
};

/** Own-property lookup: "constructor" or "__proto__" are not adapters. */
async function adapterNode(adapter: string, query: Record<string, unknown>) {
    if (!Object.hasOwn(ADAPTERS, adapter)) throw unauthorized("节点认证失败。");
    const protocols = ADAPTERS[adapter]!;
    const stored = await db.node.findUnique({
        where: { id: parseNodeId(query.node_id) },
        select: { protocol: true },
    });
    if (!stored || !protocols.includes(stored.protocol))
        throw unauthorized("节点认证失败。");
    return authenticateNode(query, stored.protocol);
}

nodeRoutes.get("/v1/server/:adapter/config", async (req, res) => {
    const { adapter } = req.params;
    const node = await adapterNode(adapter, req.query);
    const typed = typedSettings(node);
    if (adapter === "TrojanTidalab") {
        const sni =
            typed.protocol === "trojan" && typed.settings.security === "tls"
                ? sniOf(typed.settings.tls, node.host)
                : node.host;
        res.json({ local_port: node.serverPort, ssl: { sni } });
        return;
    }
    if (adapter === "ShadowsocksTidalab") {
        res.json({
            server_port: node.serverPort,
            cipher:
                typed.protocol === "shadowsocks" ? typed.settings.cipher : null,
        });
        return;
    }
    res.json({
        inbound: {
            port: node.serverPort,
            protocol: node.protocol,
            settings: { clients: [] },
            streamSettings: xrayStreamSettings(node),
        },
        routing: { rules: [] },
    });
});

nodeRoutes.get("/v1/server/:adapter/user", async (req, res) => {
    const { adapter } = req.params;
    const node = await adapterNode(adapter, req.query);
    const typed = typedSettings(node);
    const users = await nodeUsers(node.id);
    res.json({
        data: users.map((user) => ({
            id: user.id,
            ...(adapter === "Deepbwork"
                ? {
                      v2ray_user: {
                          uuid: user.uuid,
                          email: `${user.id}@xboard.local`,
                          alter_id: 0,
                      },
                  }
                : adapter === "TrojanTidalab"
                  ? { trojan_user: { password: user.uuid } }
                  : {
                        secret: user.uuid,
                        cipher:
                            typed.protocol === "shadowsocks"
                                ? typed.settings.cipher
                                : null,
                        port: node.serverPort,
                    }),
        })),
    });
});

/** XrayR sends `[{ user_id, u, d }]`; convert to the UniProxy map. */
nodeRoutes.post("/v1/server/:adapter/submit", async (req, res) => {
    const node = await adapterNode(req.params.adapter, req.query);
    const body: unknown = req.body;
    if (!Array.isArray(body) || body.length > 5000)
        throw badRequest("Invalid traffic report");
    const traffic: Record<string, unknown[]> = {};
    for (const item of body as unknown[]) {
        const row = item as {
            user_id?: unknown;
            u?: unknown;
            d?: unknown;
        } | null;
        if (
            !row ||
            typeof row !== "object" ||
            !Number.isSafeInteger(row.user_id) ||
            (row.user_id as number) < 1 ||
            Object.hasOwn(traffic, String(row.user_id))
        )
            throw badRequest("Invalid traffic report");
        traffic[String(row.user_id)] = [row.u, row.d];
    }
    res.status(201).json(
        await recordTraffic(
            node,
            traffic,
            idempotencyKey(req.headers["idempotency-key"]),
        ),
    );
});
