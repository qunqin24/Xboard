import { isIP } from "node:net";
import { Router } from "express";
import type { Node, Prisma } from "@prisma/client";
import {
    idParam,
    nodeBody,
    nodeBulkEnabledBody,
    nodeEnabledBody,
    noticeBody,
    planBody,
    type AdminNode,
    type AdminNotice,
    type AdminPlan,
    type NodeBody,
    type PlanBody,
} from "@xboard/contracts";
import { db, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { parse } from "../../http/validate";
import { newToken, sessionDigest } from "../auth/service";
import {
    jsonObjects,
    nodeCertConfig,
    nodeRateRanges,
    nodeRoutes,
    typedSettings,
} from "../nodes/settings";
import { audit, iso, isoOrNull } from "./shared";
import { adminActorId, adminRead, adminWrite } from "./operations";

export const catalogRoutes = Router();

// ---------- Plans ----------

type PlanRow = Prisma.PlanGetPayload<{ include: { prices: true } }>;

function toAdminPlan(plan: PlanRow): AdminPlan {
    return {
        id: plan.id,
        name: plan.name,
        content: plan.content,
        transferEnable: plan.transferEnable.toString(),
        speedLimit: plan.speedLimit,
        deviceLimit: plan.deviceLimit,
        published: plan.published,
        sort: plan.sort,
        trafficResetMode: plan.trafficResetMode,
        trafficResetPriceMinor: plan.trafficResetPriceMinor,
        prices: plan.prices.map(({ period, amountMinor }) => ({
            period,
            amountMinor,
        })),
    };
}

catalogRoutes.get(
    "/plans",
    adminRead(async (_req) => {
        const plans = await db.plan.findMany({
            where: { deletedAt: null },
            include: { prices: { orderBy: { id: "asc" } } },
            orderBy: [{ sort: "asc" }, { id: "asc" }],
        });
        return plans.map(toAdminPlan);
    }),
);

async function savePlan(tx: Tx, actorId: number, input: PlanBody, id?: number) {
    if (new Set(input.prices.map((p) => p.period)).size !== input.prices.length)
        throw badRequest("付款周期重复。");
    if (input.published && !input.prices.length)
        throw badRequest("已发布的套餐至少需要一个价格。");
    const { transferBytes, prices, ...rest } = input;
    const before = id
        ? await tx.plan.findFirst({
              where: { id, deletedAt: null },
              include: { prices: true },
          })
        : null;
    if (id && !before) throw notFound("套餐不存在。");
    const data = {
        ...rest,
        speedLimit: input.speedLimit ?? null,
        deviceLimit: input.deviceLimit ?? null,
        transferEnable: BigInt(transferBytes),
    };
    const plan = id
        ? await tx.plan.update({ where: { id }, data })
        : await tx.plan.create({ data });
    await tx.planPrice.deleteMany({ where: { planId: plan.id } });
    await tx.planPrice.createMany({
        data: prices.map((p) => ({ ...p, planId: plan.id })),
    });
    const after = await tx.plan.findUniqueOrThrow({
        where: { id: plan.id },
        include: { prices: { orderBy: { id: "asc" } } },
    });
    await audit(tx, actorId, "plan.save", plan.id, {
        name: plan.name,
        before: before ? toAdminPlan(before) : null,
        after: toAdminPlan(after),
    });
    return toAdminPlan(after);
}

catalogRoutes.post(
    "/plans",
    adminWrite(201, async (req, tx) => {
        return savePlan(tx, adminActorId(req), parse(planBody, req.body));
    }),
);

catalogRoutes.put(
    "/plans/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        return savePlan(tx, adminActorId(req), parse(planBody, req.body), id);
    }),
);

/**
 * Soft delete: paid orders keep their plan. A plan that still has unexpired
 * subscribers must be unpublished and left to expire first.
 */
catalogRoutes.delete(
    "/plans/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const actorId = adminActorId(req);
        await tx.$queryRaw`SELECT id FROM "Plan" WHERE id = ${id} FOR UPDATE`;
        const plan = await tx.plan.findFirst({
            where: { id, deletedAt: null },
        });
        if (!plan) throw notFound("套餐不存在。");
        // Expired subscribers keep planId as history and do not block deletion.
        const users = await tx.user.count({
            where: {
                planId: id,
                OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
            },
        });
        if (users)
            throw conflict(
                `仍有 ${users} 个有效订阅使用该套餐，请先下架，待到期或为用户更换套餐后再删除。`,
            );
        await tx.plan.update({
            where: { id },
            data: { deletedAt: new Date(), published: false },
        });
        await tx.nodePlan.deleteMany({ where: { planId: id } });
        await audit(tx, actorId, "plan.delete", id, { name: plan.name });
        return { ok: true };
    }),
);

// ---------- Nodes ----------

function toAdminNode(node: Node & { plans: { planId: number }[] }): AdminNode {
    return {
        id: node.id,
        name: node.name,
        ...typedSettings(node),
        host: node.host,
        port: node.port,
        serverPort: node.serverPort,
        enabled: node.enabled,
        visible: node.visible,
        tags: node.tags,
        parentId: node.parentId,
        rate: node.rate,
        rateRanges: nodeRateRanges(node),
        routes: nodeRoutes(node),
        customOutbounds: jsonObjects(node.customOutbounds),
        customRoutes: jsonObjects(node.customRoutes),
        certConfig: nodeCertConfig(node),
        lastSeenAt: isoOrNull(node.lastSeenAt),
        plans: node.plans.map(({ planId }) => ({ planId })),
    };
}

catalogRoutes.get(
    "/nodes",
    adminRead(async (_req) => {
        const nodes = await db.node.findMany({
            where: { deletedAt: null },
            include: { plans: { select: { planId: true } } },
            orderBy: { id: "asc" },
        });
        return nodes.map(toAdminNode);
    }),
);

/** An IP address or a DNS name ("node1", "hk.example.com"); not "1.2.3.999". */
function isHost(host: string): boolean {
    if (isIP(host)) return true;
    const labels = host.split(".");
    return (
        host.length <= 253 &&
        labels.every((label) =>
            /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label),
        ) &&
        !/^\d+$/.test(labels.at(-1)!)
    );
}

/**
 * A relay child must point at a live backend node of the same protocol, one
 * level deep: the parent is not itself a relay, and a node with relays cannot
 * become one.
 */
async function checkParent(
    tx: Prisma.TransactionClient,
    input: NodeBody,
    id?: number,
) {
    if (input.parentId === null) return;
    if (input.parentId === id) throw badRequest("父节点不能是节点自身。");
    const parent = await tx.node.findFirst({
        where: { id: input.parentId, deletedAt: null },
    });
    if (!parent) throw badRequest("父节点不存在或已删除。");
    if (parent.parentId !== null)
        throw badRequest("父节点本身是中转节点，只支持一层中转。");
    if (parent.protocol !== input.protocol)
        throw badRequest("中转节点的协议需与父节点一致。");
    if (
        id &&
        (await tx.node.count({ where: { parentId: id, deletedAt: null } }))
    )
        throw badRequest("该节点下有中转节点，不能再设为中转节点。");
}

/** Returns the node token only when a backend node is created; it is stored as a digest. */
async function saveNode(tx: Tx, actorId: number, input: NodeBody, id?: number) {
    if (!isHost(input.host)) throw badRequest("节点地址不是有效的 IP 或域名。");
    const { planIds, serverPort, ...rest } = input;
    const data = {
        ...rest,
        serverPort: serverPort ?? input.port,
        settings: rest.settings as Prisma.InputJsonValue,
        rateRanges: rest.rateRanges as Prisma.InputJsonValue,
        routes: rest.routes as Prisma.InputJsonValue,
        customOutbounds: rest.customOutbounds as Prisma.InputJsonValue,
        customRoutes: rest.customRoutes as Prisma.InputJsonValue,
        certConfig: rest.certConfig as Prisma.InputJsonValue,
    };
    const token = newToken();
    const live = await tx.plan.count({
        where: { id: { in: planIds }, deletedAt: null },
    });
    if (live !== planIds.length) throw badRequest("关联的套餐不存在或已删除。");
    await checkParent(tx, input, id);
    // Relays share their parent's protocol: changing a parent's protocol
    // would silently break them.
    if (id) {
        const before = await tx.node.findFirst({
            where: { id, deletedAt: null },
        });
        if (!before) throw notFound("节点不存在。");
        if (
            before.protocol !== input.protocol &&
            (await tx.node.count({
                where: { parentId: id, deletedAt: null },
            }))
        )
            throw badRequest("该节点下有中转节点，不能更换协议。");
    }
    const node = id
        ? await tx.node.update({ where: { id, deletedAt: null }, data })
        : await tx.node.create({
              data: { ...data, tokenHash: sessionDigest(token) },
          });
    await tx.nodePlan.deleteMany({ where: { nodeId: node.id } });
    await tx.nodePlan.createMany({
        data: planIds.map((planId) => ({ nodeId: node.id, planId })),
    });
    await audit(tx, actorId, "node.save", node.id, { name: node.name });
    return { id: node.id, ...(id || node.parentId !== null ? {} : { token }) };
}

catalogRoutes.post(
    "/nodes",
    adminWrite(201, async (req, tx) => {
        return saveNode(tx, adminActorId(req), parse(nodeBody, req.body));
    }),
);

catalogRoutes.put(
    "/nodes/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        return saveNode(tx, adminActorId(req), parse(nodeBody, req.body), id);
    }),
);

catalogRoutes.put(
    "/nodes/:id/enabled",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const { enabled } = parse(nodeEnabledBody, req.body);
        const actorId = adminActorId(req);
        const node = await tx.node.update({
            where: { id, deletedAt: null },
            data: { enabled },
        });
        await audit(tx, actorId, enabled ? "node.enable" : "node.disable", id, {
            name: node.name,
        });
        return { id };
    }),
);

catalogRoutes.post(
    "/nodes/bulk-enabled",
    adminWrite(200, async (req, tx) => {
        const { ids, enabled } = parse(nodeBulkEnabledBody, req.body);
        const actorId = adminActorId(req);
        // Only nodes that exist and are not already in the target state.
        const nodes = await tx.node.findMany({
            where: { id: { in: ids }, deletedAt: null, enabled: !enabled },
            select: { id: true },
        });
        const changed = nodes.map((node) => node.id);
        if (changed.length) {
            await tx.node.updateMany({
                where: { id: { in: changed } },
                data: { enabled },
            });
            await audit(
                tx,
                actorId,
                enabled ? "node.bulk_enable" : "node.bulk_disable",
                changed.join(","),
                { ids: changed },
            );
        }
        const updated = changed.length;
        return { updated, skipped: ids.length - updated };
    }),
);

catalogRoutes.post(
    "/nodes/:id/token",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const actorId = adminActorId(req);
        const token = newToken();
        const node = await tx.node.update({
            where: { id, deletedAt: null },
            data: { tokenHash: sessionDigest(token) },
        });
        if (node.parentId !== null)
            throw badRequest("中转节点由父节点的后端提供服务，没有通信密钥。");
        await audit(tx, actorId, "node.rotate", id);
        return { token };
    }),
);

/** Soft delete keeps traffic history; a fresh unknown token locks out a still-running backend. */
catalogRoutes.delete(
    "/nodes/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const actorId = adminActorId(req);
        const relays = await tx.node.count({
            where: { parentId: id, deletedAt: null },
        });
        if (relays)
            throw conflict(
                `该节点下有 ${relays} 个中转节点，请先删除它们或改挂其他父节点。`,
            );
        const node = await tx.node.update({
            where: { id, deletedAt: null },
            data: {
                deletedAt: new Date(),
                enabled: false,
                tokenHash: sessionDigest(newToken()),
            },
        });
        await tx.nodePlan.deleteMany({ where: { nodeId: id } });
        await audit(tx, actorId, "node.delete", id, { name: node.name });
        return { ok: true };
    }),
);

// ---------- Notices ----------

function toAdminNotice(notice: {
    id: number;
    title: string;
    content: string;
    published: boolean;
    createdAt: Date;
}): AdminNotice {
    return { ...notice, createdAt: iso(notice.createdAt) };
}

catalogRoutes.get(
    "/notices",
    adminRead(async (_req) => {
        const notices = await db.notice.findMany({
            orderBy: { id: "desc" },
            take: 100,
        });
        return notices.map(toAdminNotice);
    }),
);

catalogRoutes.post(
    "/notices",
    adminWrite(201, async (req, tx) => {
        const data = parse(noticeBody, req.body);
        const actorId = adminActorId(req);
        const notice = await tx.notice.create({ data });
        await audit(tx, actorId, "notice.create", notice.id);
        return toAdminNotice(notice);
    }),
);

catalogRoutes.put(
    "/notices/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const data = parse(noticeBody, req.body);
        const actorId = adminActorId(req);
        const notice = await tx.notice.update({ where: { id }, data });
        await audit(tx, actorId, "notice.update", id);
        return toAdminNotice(notice);
    }),
);

catalogRoutes.delete(
    "/notices/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const actorId = adminActorId(req);
        await tx.notice.delete({ where: { id } });
        await audit(tx, actorId, "notice.delete", id);
        return { ok: true };
    }),
);
