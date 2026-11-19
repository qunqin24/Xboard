import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Node } from "@prisma/client";
import { db } from "../../db";
import { badRequest, conflict, unauthorized } from "../../http/errors";
import { canUseNodes } from "../account/entitlement";
import { resetDueTraffic, type CycleUser } from "../account/traffic-cycle";
import { sessionDigest } from "../auth/service";
import { applyRate, currentRate } from "./settings";

type Query = Record<string, unknown>;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_ENTRIES = 5000;
/** Largest per-report counter accepted (1 PB). */
const MAX_COUNTER = 1_000_000_000_000_000;

function denied() {
    return unauthorized("节点认证失败。");
}

export function parseNodeId(value: unknown): number {
    const id =
        typeof value === "string" && /^\d{1,10}$/.test(value)
            ? Number(value)
            : NaN;
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) throw denied();
    return id;
}

/**
 * Check `node_id` + `token` from the query string. `protocol` defaults to the
 * UniProxy `node_type` parameter ("v2ray" means vmess).
 */
export async function authenticateNode(
    query: Query,
    protocol?: string,
): Promise<Node> {
    const id = parseNodeId(query.node_id);
    const token = query.token;
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) throw denied();
    const node = await db.node.findUnique({ where: { id } });
    const expected = Buffer.from(node?.tokenHash ?? "", "hex");
    const given = Buffer.from(sessionDigest(token), "hex");
    const type =
        protocol ?? (query.node_type === "v2ray" ? "vmess" : query.node_type);
    if (
        !node ||
        !node.enabled ||
        node.deletedAt !== null ||
        // A relay child has no backend of its own; its parent serves it.
        node.parentId !== null ||
        type !== node.protocol ||
        expected.length !== given.length ||
        !timingSafeEqual(expected, given)
    )
        throw denied();
    await db.node.update({ where: { id }, data: { lastSeenAt: new Date() } });
    return node;
}

export type NodeUser = {
    id: number;
    uuid: string;
    speed_limit: number;
    device_limit: number;
};

/**
 * The nodes a backend serves: itself and its enabled relay children. Users of
 * a child's plans connect through the relay to this backend.
 */
export async function servedNodeIds(nodeId: number): Promise<number[]> {
    const children = await db.node.findMany({
        where: { parentId: nodeId, enabled: true, deletedAt: null },
        select: { id: true },
    });
    return [nodeId, ...children.map((child) => child.id)];
}

/** Users allowed on a backend: their plan includes it or one of its relays, and they may use nodes now. */
export async function nodeUsers(nodeId: number): Promise<NodeUser[]> {
    const now = new Date();
    const served = await servedNodeIds(nodeId);
    const users = await db.user.findMany({
        where: {
            banned: false,
            plan: { nodes: { some: { nodeId: { in: served } } } },
            OR: [{ expiredAt: null }, { expiredAt: { gt: now } }],
        },
        select: {
            id: true,
            proxyUuid: true,
            speedLimit: true,
            deviceLimit: true,
            banned: true,
            planId: true,
            expiredAt: true,
            upload: true,
            download: true,
            transferEnable: true,
        },
        orderBy: { id: "asc" },
    });
    return users
        .filter((user) => canUseNodes(user, now))
        .map((user) => ({
            id: user.id,
            uuid: user.proxyUuid,
            speed_limit: user.speedLimit ?? 0,
            device_limit: user.deviceLimit ?? 0,
        }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Add a node's traffic report `{ "<userId>": [upload, download] }`, multiplied
 * by the node's current rate (see `currentRate`); the records keep the charged
 * amounts. With an idempotency key, a retried batch is applied once; reusing
 * the key for different content is a 409.
 */
export async function recordTraffic(node: Node, input: unknown, key?: string) {
    if (!isPlainObject(input)) throw badRequest("Invalid traffic map");
    const entries = Object.entries(input);
    if (
        entries.length > MAX_ENTRIES ||
        (key !== undefined && (key.length > 128 || !/^[\w-]+$/.test(key)))
    )
        throw badRequest("Invalid traffic report");
    const rate = currentRate(node);
    const records = entries
        .map(([id, values]) => {
            if (
                !/^[1-9]\d{0,9}$/.test(id) ||
                Number(id) > 2_147_483_647 ||
                !Array.isArray(values) ||
                values.length !== 2 ||
                !values.every(
                    (n) =>
                        Number.isSafeInteger(n) && n >= 0 && n <= MAX_COUNTER,
                )
            )
                throw badRequest("Invalid traffic counters");
            return {
                userId: Number(id),
                upload: applyRate(BigInt(values[0]), rate),
                download: applyRate(BigInt(values[1]), rate),
            };
        })
        .filter((row) => row.upload > 0n || row.download > 0n)
        .sort((a, b) => a.userId - b.userId);
    const digest = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");

    const served = await servedNodeIds(node.id);
    await db.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Node" WHERE id = ${node.id} FOR UPDATE`;
            if (key !== undefined) {
                const receipt = await tx.trafficReceipt.findUnique({
                    where: { nodeId_key: { nodeId: node.id, key } },
                });
                if (receipt) {
                    if (receipt.digest !== digest)
                        throw conflict("Batch key already used");
                    return;
                }
            }
            if (records.length) {
                // One statement locks every reported user, in id order, so two
                // nodes reporting overlapping users cannot deadlock.
                const ids = records.map((row) => row.userId);
                const owned = await tx.$queryRaw<CycleUser[]>`
                    SELECT u.id, u."planId", u."expiredAt", u.upload, u.download,
                           u."nextTrafficResetAt", u."trafficResetDay", u."trafficResetMonth"
                    FROM "User" u
                    WHERE u.id = ANY(${ids}::int[])
                      AND EXISTS (SELECT 1 FROM "NodePlan" np WHERE np."nodeId" = ANY(${served}::int[]) AND np."planId" = u."planId")
                    ORDER BY u.id FOR UPDATE OF u`;
                const allowed = new Set(owned.map((row) => row.id));
                const accepted = records.filter((row) =>
                    allowed.has(row.userId),
                );
                if (accepted.length) {
                    await resetDueTraffic(tx, owned, new Date());
                    await tx.$executeRaw`
                        UPDATE "User" AS u
                        SET upload = u.upload + t.up, download = u.download + t.down,
                            "updatedAt" = ${new Date().toISOString()}::timestamp(3)
                        FROM unnest(
                            ${accepted.map((row) => row.userId)}::int[],
                            ${accepted.map((row) => row.upload.toString())}::text[]::bigint[],
                            ${accepted.map((row) => row.download.toString())}::text[]::bigint[]
                        ) AS t(id, up, down)
                        WHERE u.id = t.id`;
                    await tx.trafficRecord.createMany({
                        data: accepted.map((row) => ({
                            ...row,
                            nodeId: node.id,
                        })),
                    });
                }
            }
            if (key !== undefined)
                await tx.trafficReceipt.create({
                    data: { nodeId: node.id, key, digest },
                });
        },
        { timeout: 30_000 },
    );
    return { data: true };
}

/** Replace the node's online-device list: `{ "<userId>": ["1.2.3.4", …] }`. */
export async function recordAlive(nodeId: number, input: unknown) {
    if (!isPlainObject(input)) throw badRequest("Invalid alive map");
    const entries = Object.entries(input);
    if (entries.length > MAX_ENTRIES) throw badRequest("Invalid alive map");
    const allowed = new Set((await nodeUsers(nodeId)).map((user) => user.id));
    const seenAt = new Date();
    const data: { nodeId: number; userId: number; ip: string; seenAt: Date }[] =
        [];
    for (const [id, ips] of entries) {
        if (
            !Array.isArray(ips) ||
            ips.length > 1000 ||
            ips.some((ip) => typeof ip !== "string" || !isIP(ip))
        )
            throw badRequest("Invalid alive map");
        if (allowed.has(Number(id)))
            for (const ip of new Set<string>(ips))
                data.push({ nodeId, userId: Number(id), ip, seenAt });
    }
    await db.$transaction([
        db.onlineDevice.deleteMany({ where: { nodeId } }),
        db.onlineDevice.createMany({ data, skipDuplicates: true }),
    ]);
    return { data: true };
}

/** Distinct online IPs per allowed user across all nodes, seen in the last 3 minutes. */
export async function aliveCounts(nodeId: number) {
    const allowed = (await nodeUsers(nodeId)).map((user) => user.id);
    const devices = await db.onlineDevice.findMany({
        where: {
            userId: { in: allowed },
            seenAt: { gt: new Date(Date.now() - 180_000) },
        },
        select: { userId: true, ip: true },
    });
    const users = new Map<number, Set<string>>();
    for (const device of devices) {
        const ips = users.get(device.userId) ?? new Set<string>();
        ips.add(device.ip);
        users.set(device.userId, ips);
    }
    return {
        alive: Object.fromEntries(
            [...users].map(([id, ips]) => [id, ips.size]),
        ),
    };
}

/** Keep only validated metrics, never an arbitrary object from a node. */
export async function saveStatus(nodeId: number, input: unknown) {
    if (!isPlainObject(input)) throw badRequest("Invalid status");
    if (typeof input.cpu !== "number" || !(input.cpu >= 0 && input.cpu <= 100))
        throw badRequest("Invalid status");
    const status: Record<string, number | { total: number; used: number }> = {
        cpu: input.cpu,
    };
    for (const name of ["mem", "swap", "disk"]) {
        const item = input[name];
        if (
            !isPlainObject(item) ||
            !Number.isSafeInteger(item.total) ||
            !Number.isSafeInteger(item.used) ||
            (item.total as number) < 0 ||
            (item.used as number) < 0 ||
            (item.used as number) > (item.total as number)
        )
            throw badRequest("Invalid status");
        status[name] = {
            total: item.total as number,
            used: item.used as number,
        };
    }
    await db.node.update({ where: { id: nodeId }, data: { status } });
    return { data: true, code: 0, message: "success" };
}
