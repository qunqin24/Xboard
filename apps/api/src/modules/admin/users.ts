import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Prisma, User } from "@prisma/client";
import {
    banBody,
    bulkBanBody,
    creditBody,
    idParam,
    resetTrafficBody,
    updateUserBody,
    userListQuery,
    type AdminUser,
} from "@xboard/contracts";
import { db, lockUser } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { unixSeconds } from "../account/service";
import { hashPassword } from "../auth/password";
import { revokeAccess } from "../auth/service";
import { audit, numericTerm, pageArgs, paged, isoOrNull, iso } from "./shared";

export const userRoutes = Router();
const MAX_BALANCE_MINOR = 2_000_000_000;

function toAdminUser(user: User): AdminUser {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        balance: user.balance,
        banned: user.banned,
        transferEnable: user.transferEnable.toString(),
        upload: user.upload.toString(),
        download: user.download.toString(),
        planId: user.planId,
        expiredAt: unixSeconds(user.expiredAt),
        verifiedAt: isoOrNull(user.verifiedAt),
        speedLimit: user.speedLimit,
        deviceLimit: user.deviceLimit,
        createdAt: iso(user.createdAt),
        lastLoginAt: unixSeconds(user.lastLoginAt),
    };
}

/** `plan=3,none`: users on plan 3 or on no plan. */
function planFilter(plan: (number | "none")[]): Prisma.UserWhereInput {
    if (!plan.length) return {};
    const ids = plan.filter((value): value is number => value !== "none");
    const none = plan.includes("none");
    const conditions: Prisma.UserWhereInput[] = [
        ...(ids.length ? [{ planId: { in: ids } }] : []),
        ...(none ? [{ planId: null }] : []),
    ];
    return { AND: [{ OR: conditions }] };
}

/** Search by email fragment or exact id, with status, role, verification and plan filters. */
userRoutes.get("/users", async (req, res) => {
    const query = parse(userListQuery, req.query);
    const id = numericTerm(query.q);
    const where: Prisma.UserWhereInput = {
        ...(query.q
            ? {
                  OR: [
                      { email: { contains: query.q, mode: "insensitive" } },
                      ...(id ? [{ id }] : []),
                  ],
              }
            : {}),
        // Both statuses selected is the same as no filter.
        ...(query.status.length === 1
            ? { banned: query.status[0] === "banned" }
            : {}),
        ...(query.role.length ? { role: { in: query.role } } : {}),
        ...(query.verified.length === 1
            ? {
                  verifiedAt:
                      query.verified[0] === "verified" ? { not: null } : null,
              }
            : {}),
        ...planFilter(query.plan),
    };
    const [total, users] = await db.$transaction([
        db.user.count({ where }),
        db.user.findMany({
            where,
            orderBy: { id: "desc" },
            ...pageArgs(query),
        }),
    ]);
    res.json(paged(query, total, users.map(toAdminUser)));
});

userRoutes.get("/users/:id", async (req, res) => {
    const user = await db.user.findUnique({
        where: { id: parse(idParam, req.params.id) },
    });
    if (!user) throw notFound("用户不存在。");
    res.json(toAdminUser(user));
});

/** Edit the subscription: plan, expiry, quota and limits. */
userRoutes.put("/users/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const input = parse(updateUserBody, req.body);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
        await lockUser(tx, id);
        const before = await tx.user.findUnique({ where: { id } });
        if (!before) throw notFound("用户不存在。");
        if (
            input.planId !== null &&
            !(await tx.plan.findFirst({
                where: { id: input.planId, deletedAt: null },
            }))
        )
            throw badRequest("套餐不存在或已删除。");
        const data = {
            planId: input.planId,
            expiredAt:
                input.expiredAt === null
                    ? null
                    : new Date(input.expiredAt * 1000),
            transferEnable: BigInt(input.transferBytes),
            speedLimit: input.speedLimit,
            deviceLimit: input.deviceLimit,
        };
        await tx.user.update({ where: { id }, data });
        const snapshot = (user: typeof data) => ({
            planId: user.planId,
            expiredAt: unixSeconds(user.expiredAt),
            transferBytes: user.transferEnable.toString(),
            speedLimit: user.speedLimit,
            deviceLimit: user.deviceLimit,
        });
        await audit(tx, actor.id, "user.update", id, {
            before: snapshot(before),
            after: snapshot(data),
        });
    });
    res.json({ ok: true });
});

/** Manual top-up. `requestId` makes a retried submit apply once. */
userRoutes.post("/users/:id/credit", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const input = parse(creditBody, req.body);
    const actor = currentUser(req);
    const result = await db.$transaction(async (tx) => {
        await lockUser(tx, id);
        const prior = await tx.balanceEntry.findUnique({
            where: { requestId: input.requestId },
        });
        if (prior) {
            if (
                prior.userId !== id ||
                prior.amountMinor !== input.amountMinor ||
                prior.reason !== input.reason
            )
                throw conflict("请求编号已用于另一笔入账。");
            return { id: prior.id };
        }
        const user = await tx.user.findUnique({ where: { id } });
        if (!user) throw notFound("用户不存在。");
        if (user.balance + input.amountMinor > MAX_BALANCE_MINOR)
            throw badRequest("余额超过上限。");
        await tx.user.update({
            where: { id },
            data: { balance: { increment: input.amountMinor } },
        });
        const entry = await tx.balanceEntry.create({
            data: { ...input, userId: id, actorId: actor.id },
        });
        await audit(tx, actor.id, "balance.credit", id, {
            amountMinor: input.amountMinor,
            reason: input.reason,
            entryId: entry.id,
        });
        return { id: entry.id };
    });
    res.status(201).json(result);
});

/** Ban or unban; banning signs the user out everywhere. Admins are skipped. */
async function setBanned(
    actorId: number,
    ids: number[],
    banned: boolean,
    bulk: boolean,
) {
    return db.$transaction(async (tx) => {
        const targets = await tx.user.findMany({
            where: { id: { in: ids }, role: { not: "admin" } },
            select: { id: true },
            orderBy: { id: "asc" },
        });
        const allowed = targets.map((user) => user.id);
        await tx.user.updateMany({
            where: { id: { in: allowed } },
            data: { banned },
        });
        for (const id of allowed) {
            await revokeAccess(tx, id);
            await audit(
                tx,
                actorId,
                "user.ban",
                id,
                bulk ? { banned, bulk: true } : { banned },
            );
        }
        return allowed;
    });
}

userRoutes.post("/users/ban", async (req, res) => {
    const input = parse(bulkBanBody, req.body);
    const updated = await setBanned(
        currentUser(req).id,
        input.ids,
        input.banned,
        true,
    );
    res.status(201).json({
        updated: updated.length,
        skipped: input.ids.length - updated.length,
    });
});

userRoutes.post("/users/:id/ban", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const { banned } = parse(banBody, req.body);
    const target = await db.user.findUnique({
        where: { id },
        select: { role: true },
    });
    if (!target) throw notFound("用户不存在。");
    if (target.role === "admin") throw badRequest("不能通过此接口封禁管理员。");
    await setBanned(currentUser(req).id, [id], banned, false);
    res.status(201).json({ ok: true });
});

userRoutes.post("/users/:id/reset-traffic", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const { reason } = parse(resetTrafficBody, req.body);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
        await lockUser(tx, id);
        const before = await tx.user.findUnique({
            where: { id },
            select: { upload: true, download: true },
        });
        if (!before) throw notFound("用户不存在。");
        await tx.user.update({
            where: { id },
            data: { upload: 0n, download: 0n },
        });
        await audit(tx, actor.id, "traffic.reset", id, {
            reason,
            before: {
                upload: before.upload.toString(),
                download: before.download.toString(),
            },
        });
    });
    res.status(201).json({ ok: true });
});

/** A temporary password, returned exactly once; it is never stored or logged in plain text. */
userRoutes.post("/users/:id/password", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const actor = currentUser(req);
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw notFound("用户不存在。");
    if (target.role === "admin")
        throw badRequest("不能通过此接口重置管理员密码。");
    const alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const password = Array.from(
        randomBytes(16),
        (byte) => alphabet[byte % alphabet.length],
    ).join("");
    const encoded = await hashPassword(password);
    await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { password: encoded } });
        await revokeAccess(tx, id);
        await audit(tx, actor.id, "user.password_reset", id);
    });
    res.status(201).json({ password });
});

/** New proxy UUID for a user whose client config leaked. */
userRoutes.post("/users/:id/credentials", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
        await tx.user.update({
            where: { id },
            data: { proxyUuid: randomUUID() },
        });
        await audit(tx, actor.id, "user.credentials_rotate", id);
    });
    res.status(201).json({ ok: true });
});
