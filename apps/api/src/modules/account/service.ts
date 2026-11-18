import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import type { Account, LedgerItem, TrafficItem } from "@xboard/contracts";
import { getConfig, getSmtpConfig } from "../../config";
import { db, lockUser } from "../../db";
import { badRequest, HttpError } from "../../http/errors";
import { hashPassword, verifyPassword } from "../auth/password";
import { newToken, revokeAccess, sessionDigest } from "../auth/service";
import { toPlan } from "../plans/service";

export function unixSeconds(date: Date | null): number | null {
    return date === null ? null : Math.floor(date.getTime() / 1000);
}

/** Explicit allowlist: no password hash, proxy UUID or subscription token. */
export async function toAccount(user: User): Promise<Account> {
    const plan =
        user.planId === null
            ? null
            : await db.plan.findUnique({
                  where: { id: user.planId },
                  include: { prices: { orderBy: { id: "asc" } } },
              });
    return {
        email: user.email,
        role: user.role,
        emailVerified: user.verifiedAt !== null,
        balanceMinor: user.balance,
        speedLimitMbps: user.speedLimit,
        deviceLimit: user.deviceLimit,
        uploadBytes: user.upload.toString(),
        downloadBytes: user.download.toString(),
        transferBytes: user.transferEnable.toString(),
        expiredAt: unixSeconds(user.expiredAt),
        plan: plan ? toPlan(plan) : null,
    };
}

export function requireMail() {
    if (!getSmtpConfig())
        throw new HttpError(503, "邮件服务尚未配置，请联系管理员。");
}

const LINK_TTL_MS = 30 * 60_000;
/** A second request within this time sends nothing and keeps the first link. */
const LINK_COOLDOWN_MS = 60_000;
/** Unused links per purpose; the oldest is dropped beyond this. */
const MAX_ACTIVE_LINKS = 3;

export type LinkPurpose = "verify" | "reset";

/**
 * Queue a one-time link by email. Earlier links stay valid (a slow first mail
 * still works), but a burst of requests sends at most one mail per minute.
 * Returns false when skipped by the cooldown.
 */
export async function sendEmailLink(
    user: User,
    purpose: LinkPurpose,
): Promise<boolean> {
    const token = newToken();
    const link = `${getConfig().origin}/recover#${purpose}:${token}`;
    return db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        const now = Date.now();
        const active = await tx.emailToken.findMany({
            where: {
                userId: user.id,
                purpose,
                expiresAt: { gt: new Date(now) },
            },
            orderBy: { expiresAt: "desc" },
        });
        // Tokens carry no creation time; it is expiresAt minus the fixed TTL.
        const newest = active[0];
        if (
            newest &&
            newest.expiresAt.getTime() - LINK_TTL_MS > now - LINK_COOLDOWN_MS
        )
            return false;
        const surplus = active.slice(MAX_ACTIVE_LINKS - 1).map((t) => t.hash);
        await tx.emailToken.deleteMany({
            where: {
                userId: user.id,
                purpose,
                OR: [
                    { expiresAt: { lte: new Date(now) } },
                    { hash: { in: surplus } },
                ],
            },
        });
        await tx.emailToken.create({
            data: {
                hash: sessionDigest(token),
                userId: user.id,
                purpose,
                expiresAt: new Date(now + LINK_TTL_MS),
            },
        });
        await tx.mail.create({
            data: {
                to: user.email,
                subject: purpose === "verify" ? "验证你的邮箱" : "重置账户密码",
                text: `请在 30 分钟内打开链接：\n${link}\n若非本人操作，请忽略此邮件。`,
            },
        });
        return true;
    });
}

/**
 * Use a one-time link. The token is checked before any password hashing, so
 * invalid links cost no scrypt work. A password reset signs out every session.
 */
export async function consumeEmailLink(
    token: string,
    purpose: LinkPurpose,
    password?: string,
) {
    const hash = sessionDigest(token);
    const found = await db.emailToken.findUnique({ where: { hash } });
    if (!found || found.purpose !== purpose || found.expiresAt <= new Date())
        throw badRequest("链接无效或已过期。");
    const encoded =
        password === undefined ? undefined : await hashPassword(password);
    await db.$transaction(async (tx) => {
        await lockUser(tx, found.userId);
        const consumed = await tx.emailToken.deleteMany({
            where: { hash, purpose, expiresAt: { gt: new Date() } },
        });
        if (consumed.count !== 1) throw badRequest("链接已使用。");
        if (encoded) {
            await tx.user.update({
                where: { id: found.userId },
                data: { password: encoded },
            });
            await revokeAccess(tx, found.userId);
        } else {
            await tx.user.update({
                where: { id: found.userId },
                data: { verifiedAt: new Date() },
            });
        }
    });
}

export async function changePassword(
    user: User,
    oldPassword: string,
    password: string,
) {
    if (!(await verifyPassword(oldPassword, user.password)))
        throw badRequest("原密码不正确。");
    const encoded = await hashPassword(password);
    await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        const result = await tx.user.updateMany({
            where: { id: user.id, password: user.password },
            data: { password: encoded },
        });
        if (result.count !== 1) throw badRequest("密码已改变，请重新登录。");
        await revokeAccess(tx, user.id);
    });
}

/**
 * New proxy UUID: every node drops the old one on its next user sync, so a
 * leaked client config stops working. Clients must import the subscription again.
 */
export async function rotateProxyCredentials(userId: number) {
    await db.user.update({
        where: { id: userId },
        data: { proxyUuid: randomUUID() },
    });
}

export async function listLedger(userId: number): Promise<LedgerItem[]> {
    const rows = await db.balanceEntry.findMany({
        where: { userId },
        take: 100,
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            amountMinor: true,
            reason: true,
            orderId: true,
            createdAt: true,
        },
    });
    return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
    }));
}

export async function listTraffic(userId: number): Promise<TrafficItem[]> {
    const rows = await db.trafficRecord.findMany({
        where: { userId },
        take: 100,
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            upload: true,
            download: true,
            createdAt: true,
            node: { select: { name: true } },
        },
    });
    return rows.map((row) => ({
        ...row,
        upload: row.upload.toString(),
        download: row.download.toString(),
        createdAt: row.createdAt.toISOString(),
    }));
}
