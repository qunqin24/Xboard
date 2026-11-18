import { isIP } from "node:net";
import { Router } from "express";
import type { Node, Prisma } from "@prisma/client";
import {
    idParam,
    nodeBody,
    noticeBody,
    planBody,
    type AdminNode,
    type AdminNotice,
    type AdminPlan,
    type NodeBody,
    type PlanBody,
} from "@xboard/contracts";
import { db } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { newToken, sessionDigest } from "../auth/service";
import { audit, iso, isoOrNull } from "./shared";

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
        prices: plan.prices.map(({ period, amountMinor }) => ({
            period,
            amountMinor,
        })),
    };
}

catalogRoutes.get("/plans", async (_req, res) => {
    const plans = await db.plan.findMany({
        where: { deletedAt: null },
        include: { prices: { orderBy: { id: "asc" } } },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
    });
    res.json(plans.map(toAdminPlan));
});

async function savePlan(actorId: number, input: PlanBody, id?: number) {
    if (new Set(input.prices.map((p) => p.period)).size !== input.prices.length)
        throw badRequest("付款周期重复。");
    if (input.published && !input.prices.length)
        throw badRequest("已发布的套餐至少需要一个价格。");
    const { transferBytes, prices, ...rest } = input;
    return db.$transaction(async (tx) => {
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
    });
}

catalogRoutes.post("/plans", async (req, res) => {
    res.status(201).json(
        await savePlan(currentUser(req).id, parse(planBody, req.body)),
    );
});

catalogRoutes.put("/plans/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    res.json(
        await savePlan(currentUser(req).id, parse(planBody, req.body), id),
    );
});

/**
 * Soft delete: paid orders keep their plan. A plan that still has unexpired
 * subscribers must be unpublished and left to expire first.
 */
catalogRoutes.delete("/plans/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
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
        await audit(tx, actor.id, "plan.delete", id, { name: plan.name });
    });
    res.json({ ok: true });
});

// ---------- Nodes ----------

function toAdminNode(node: Node & { plans: { planId: number }[] }): AdminNode {
    return {
        id: node.id,
        name: node.name,
        protocol: node.protocol,
        host: node.host,
        port: node.port,
        serverName: node.serverName,
        cipher: node.cipher,
        enabled: node.enabled,
        lastSeenAt: isoOrNull(node.lastSeenAt),
        plans: node.plans.map(({ planId }) => ({ planId })),
    };
}

catalogRoutes.get("/nodes", async (_req, res) => {
    const nodes = await db.node.findMany({
        where: { deletedAt: null },
        include: { plans: { select: { planId: true } } },
        orderBy: { id: "asc" },
    });
    res.json(nodes.map(toAdminNode));
});

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

/** Returns the node token only on creation; it is stored as a digest. */
async function saveNode(actorId: number, input: NodeBody, id?: number) {
    if (!isHost(input.host)) throw badRequest("节点地址不是有效的 IP 或域名。");
    const { planIds, ...data } = input;
    const token = newToken();
    const node = await db.$transaction(async (tx) => {
        const live = await tx.plan.count({
            where: { id: { in: planIds }, deletedAt: null },
        });
        if (live !== planIds.length)
            throw badRequest("关联的套餐不存在或已删除。");
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
        return node;
    });
    return { id: node.id, ...(id ? {} : { token }) };
}

catalogRoutes.post("/nodes", async (req, res) => {
    res.status(201).json(
        await saveNode(currentUser(req).id, parse(nodeBody, req.body)),
    );
});

catalogRoutes.put("/nodes/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    res.json(
        await saveNode(currentUser(req).id, parse(nodeBody, req.body), id),
    );
});

catalogRoutes.post("/nodes/:id/token", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const actor = currentUser(req);
    const token = newToken();
    await db.$transaction(async (tx) => {
        await tx.node.update({
            where: { id, deletedAt: null },
            data: { tokenHash: sessionDigest(token) },
        });
        await audit(tx, actor.id, "node.rotate", id);
    });
    res.status(201).json({ token });
});

/** Soft delete keeps traffic history; a fresh unknown token locks out a still-running backend. */
catalogRoutes.delete("/nodes/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
        const node = await tx.node.update({
            where: { id, deletedAt: null },
            data: {
                deletedAt: new Date(),
                enabled: false,
                tokenHash: sessionDigest(newToken()),
            },
        });
        await tx.nodePlan.deleteMany({ where: { nodeId: id } });
        await audit(tx, actor.id, "node.delete", id, { name: node.name });
    });
    res.json({ ok: true });
});

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

catalogRoutes.get("/notices", async (_req, res) => {
    const notices = await db.notice.findMany({
        orderBy: { id: "desc" },
        take: 100,
    });
    res.json(notices.map(toAdminNotice));
});

catalogRoutes.post("/notices", async (req, res) => {
    const data = parse(noticeBody, req.body);
    const actor = currentUser(req);
    const notice = await db.$transaction(async (tx) => {
        const notice = await tx.notice.create({ data });
        await audit(tx, actor.id, "notice.create", notice.id);
        return notice;
    });
    res.status(201).json(toAdminNotice(notice));
});

catalogRoutes.put("/notices/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const data = parse(noticeBody, req.body);
    const actor = currentUser(req);
    const notice = await db.$transaction(async (tx) => {
        const notice = await tx.notice.update({ where: { id }, data });
        await audit(tx, actor.id, "notice.update", id);
        return notice;
    });
    res.json(toAdminNotice(notice));
});

catalogRoutes.delete("/notices/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
        await tx.notice.delete({ where: { id } });
        await audit(tx, actor.id, "notice.delete", id);
    });
    res.json({ ok: true });
});
