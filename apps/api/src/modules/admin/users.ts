import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Prisma, User } from "@prisma/client";
import {
    banBody,
    bulkBanBody,
    bulkResetTrafficBody,
    creditBody,
    createOrderBody,
    idParam,
    resetTrafficBody,
    updateUserBody,
    userListQuery,
    type AdminUser,
} from "@xboard/contracts";
import { db, lockUser, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { parse } from "../../http/validate";
import { hasActivePlan } from "../account/entitlement";
import { unixSeconds } from "../account/service";
import { clearUsage, trafficSchedule } from "../account/traffic-cycle";
import { hashPassword } from "../auth/password";
import { revokeAccess } from "../auth/service";
import { clearTwoFactorAttempts } from "../auth/two-factor-limit";
import { MAX_BALANCE_MINOR } from "../orders/credit";
import { createOrder } from "../orders/service";
import { audit, numericTerm, pageArgs, paged, isoOrNull, iso } from "./shared";
import { adminActorId, adminRead, adminWrite } from "./operations";

export const userRoutes = Router();

const withInviter = { invitedBy: { select: { email: true } } } as const;

function toAdminUser(
    user: User & { invitedBy: { email: string } | null },
): AdminUser {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        balance: user.balance,
        banned: user.banned,
        twoFactorEnabled: user.totpSecret !== null,
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
        invitedBy: user.invitedBy?.email ?? null,
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
userRoutes.get(
    "/users",
    adminRead(async (req) => {
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
                          query.verified[0] === "verified"
                              ? { not: null }
                              : null,
                  }
                : {}),
            ...planFilter(query.plan),
        };
        const [total, users] = await db.$transaction([
            db.user.count({ where }),
            db.user.findMany({
                where,
                orderBy: { id: "desc" },
                include: withInviter,
                ...pageArgs(query),
            }),
        ]);
        return paged(query, total, users.map(toAdminUser));
    }),
);

userRoutes.get(
    "/users/:id",
    adminRead(async (req) => {
        const user = await db.user.findUnique({
            where: { id: parse(idParam, req.params.id) },
            include: withInviter,
        });
        if (!user) throw notFound("用户不存在。");
        return toAdminUser(user);
    }),
);

userRoutes.post(
    "/users/:id/orders",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        return createOrder(
            id,
            parse(createOrderBody, req.body),
            adminActorId(req),
            tx,
        );
    }),
);

/** Edit the subscription: plan, expiry, quota and limits. */
userRoutes.put(
    "/users/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const input = parse(updateUserBody, req.body);
        const actorId = adminActorId(req);
        await lockUser(tx, id);
        const before = await tx.user.findUnique({ where: { id } });
        if (!before) throw notFound("用户不存在。");
        const plan =
            input.planId === null
                ? null
                : await tx.plan.findFirst({
                      where: { id: input.planId, deletedAt: null },
                  });
        if (input.planId !== null && !plan)
            throw badRequest("套餐不存在或已删除。");
        const now = new Date();
        const expiredAt =
            input.expiredAt === unixSeconds(before.expiredAt)
                ? before.expiredAt
                : input.expiredAt === null
                  ? null
                  : new Date(input.expiredAt * 1000);
        const newTerm =
            before.planId !== input.planId ||
            (!hasActivePlan(before, now) &&
                hasActivePlan({ planId: input.planId, expiredAt }, now));
        const data = {
            planId: input.planId,
            expiredAt,
            transferEnable: BigInt(input.transferBytes),
            speedLimit: input.speedLimit,
            deviceLimit: input.deviceLimit,
        };
        await tx.user.update({
            where: { id },
            data: {
                ...data,
                ...(newTerm && {
                    ...trafficSchedule(plan?.trafficResetMode ?? "none", now),
                    entitlementVersion: { increment: 1 },
                }),
                ...(expiredAt !== before.expiredAt || newTerm
                    ? { expiryReminderMask: 0 }
                    : {}),
            },
        });
        const snapshot = (user: typeof data) => ({
            planId: user.planId,
            expiredAt: unixSeconds(user.expiredAt),
            transferBytes: user.transferEnable.toString(),
            speedLimit: user.speedLimit,
            deviceLimit: user.deviceLimit,
        });
        await audit(tx, actorId, "user.update", id, {
            before: snapshot(before),
            after: snapshot(data),
        });
        return { ok: true };
    }),
);

/** Manual top-up. `requestId` makes a retried submit apply once. */
userRoutes.post(
    "/users/:id/credit",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const input = parse(creditBody, req.body);
        const actorId = adminActorId(req);
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
            data: { ...input, userId: id, actorId: actorId },
        });
        await audit(tx, actorId, "balance.credit", id, {
            amountMinor: input.amountMinor,
            reason: input.reason,
            entryId: entry.id,
        });
        return { id: entry.id };
    }),
);

/** Ban or unban; banning signs the user out everywhere. Admins are skipped. */
async function setBanned(
    tx: Tx,
    actorId: number,
    ids: number[],
    banned: boolean,
    bulk: boolean,
) {
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
}

userRoutes.post(
    "/users/ban",
    adminWrite(201, async (req, tx) => {
        const input = parse(bulkBanBody, req.body);
        const updated = await setBanned(
            tx,
            adminActorId(req),
            input.ids,
            input.banned,
            true,
        );
        return {
            updated: updated.length,
            skipped: input.ids.length - updated.length,
        };
    }),
);

userRoutes.post(
    "/users/:id/ban",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const { banned } = parse(banBody, req.body);
        await lockUser(tx, id);
        const target = await tx.user.findUnique({
            where: { id },
            select: { role: true },
        });
        if (!target) throw notFound("用户不存在。");
        if (target.role === "admin")
            throw badRequest("不能通过此接口封禁管理员。");
        await setBanned(tx, adminActorId(req), [id], banned, false);
        return { ok: true };
    }),
);

async function resetUsersTraffic(
    tx: Tx,
    actorId: number,
    ids: number[],
    reason: string,
    bulk: boolean,
) {
    const users = await tx.$queryRaw<
        { id: number; upload: bigint; download: bigint }[]
    >`
        SELECT id, upload, download FROM "User" WHERE id = ANY(${ids}::int[]) ORDER BY id FOR UPDATE`;
    if (!bulk && !users.length) throw notFound("用户不存在。");
    await tx.user.updateMany({
        where: { id: { in: users.map(({ id }) => id) } },
        data: clearUsage,
    });
    await tx.audit.createMany({
        data: users.map(({ id, upload, download }) => ({
            actorId,
            action: "traffic.reset",
            target: String(id),
            detail: {
                reason,
                ...(bulk && { bulk: true }),
                before: {
                    upload: upload.toString(),
                    download: download.toString(),
                },
            },
        })),
    });
    return { updated: users.length, skipped: ids.length - users.length };
}

userRoutes.post(
    "/users/reset-traffic",
    adminWrite(201, async (req, tx) => {
        const { ids, reason } = parse(bulkResetTrafficBody, req.body);
        return resetUsersTraffic(tx, adminActorId(req), ids, reason, true);
    }),
);

userRoutes.post(
    "/users/:id/reset-traffic",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const { reason } = parse(resetTrafficBody, req.body);
        await resetUsersTraffic(tx, adminActorId(req), [id], reason, false);
        return { ok: true };
    }),
);

/** A temporary password, returned exactly once; it is never stored or logged in plain text. */
userRoutes.post(
    "/users/:id/password",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const actorId = adminActorId(req);
        await lockUser(tx, id);
        const target = await tx.user.findUnique({
            where: { id },
            select: { role: true },
        });
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
        await tx.user.update({ where: { id }, data: { password: encoded } });
        await revokeAccess(tx, id);
        await audit(tx, actorId, "user.password_reset", id);
        return { password };
    }),
);

/**
 * Lock-out recovery: remove the user's two-factor setup and sign them out
 * everywhere. Admin accounts are excluded, as for password resets.
 */
userRoutes.post(
    "/users/:id/two-factor/reset",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const actorId = adminActorId(req);
        await lockUser(tx, id);
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw notFound("用户不存在。");
        if (target.role === "admin")
            throw badRequest("不能通过此接口重置管理员的两步验证。");
        if (!target.totpSecret) throw conflict("该用户未启用两步验证。");
        await tx.user.update({
            where: { id },
            data: {
                totpSecret: null,
                totpLastStep: null,
                totpRecoveryHashes: [],
            },
        });
        await revokeAccess(tx, id);
        await audit(tx, actorId, "user.two_factor_reset", id);
        await clearTwoFactorAttempts(id, tx);
        return { ok: true };
    }),
);

/** New proxy UUID for a user whose client config leaked. */
userRoutes.post(
    "/users/:id/credentials",
    adminWrite(201, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const actorId = adminActorId(req);
        await tx.user.update({
            where: { id },
            data: { proxyUuid: randomUUID() },
        });
        await audit(tx, actorId, "user.credentials_rotate", id);
        return { ok: true };
    }),
);
