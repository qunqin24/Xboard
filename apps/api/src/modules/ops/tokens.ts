import { isIP } from "node:net";
import type { OpsToken as TokenRow } from "@prisma/client";
import { opsTokenBody, uuidParam, type OpsTokenInfo } from "@xboard/contracts";
import { Router } from "express";
import { db, type Tx } from "../../db";
import {
    badRequest,
    forbidden,
    notFound,
    unauthorized,
} from "../../http/errors";
import { expandIPv6 } from "../../http/rate-limit";
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";
import { newToken, sessionDigest } from "../auth/service";

export const opsTokenRoutes = Router();

const TOKEN_PREFIX = "xbo_";
const BEARER = /^Bearer (xbo_[A-Za-z0-9_-]{43})$/i;

export function readBearer(header: string | undefined) {
    return header?.match(BEARER)?.[1];
}

/** Express uses the configured trust proxy to obtain the source address. */
export function canonicalIp(value: string | undefined): string | undefined {
    const ip = value?.split("%")[0];
    if (!ip) return;
    const version = isIP(ip);
    if (version === 4) return ip;
    if (version !== 6) return;
    const groups = expandIPv6(ip);
    if (
        groups.slice(0, 5).every((group) => group === 0) &&
        groups[5] === 0xffff
    )
        return `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
    return groups.map((group) => group.toString(16)).join(":");
}

const owner = { createdBy: { select: { role: true, banned: true } } } as const;
type OpsCredential = TokenRow & {
    createdBy: { role: string; banned: boolean };
};

export function findCredential(secret: string) {
    return db.opsToken.findUnique({
        where: { tokenHash: sessionDigest(secret) },
        include: owner,
    });
}

/** Lock until commit so a concurrent revocation precedes or follows the write. */
export async function lockCredential(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "OpsToken" WHERE id = ${id}::uuid FOR SHARE`;
    return tx.opsToken.findUnique({ where: { id }, include: owner });
}

export function checkCredential(
    credential: OpsCredential | null,
    clientIp: string | undefined,
    scope: "admin:read" | "admin:write",
): asserts credential is OpsCredential {
    if (
        !credential ||
        credential.revokedAt ||
        credential.expiresAt.getTime() <= Date.now() ||
        credential.createdBy.role !== "admin" ||
        credential.createdBy.banned
    )
        throw unauthorized("运维令牌无效、已过期或已吊销。");
    if (
        credential.allowedIps.length &&
        !credential.allowedIps.includes(clientIp ?? "")
    )
        throw forbidden("当前来源 IP 无权使用此令牌。");
    if (!credential.scopes.includes("*") && !credential.scopes.includes(scope))
        throw forbidden("此令牌缺少所需权限。");
}

function toTokenInfo(row: TokenRow): OpsTokenInfo {
    return {
        id: row.id,
        name: row.name,
        scopes: row.scopes as OpsTokenInfo["scopes"],
        allowedIps: row.allowedIps,
        createdById: row.createdById,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
    };
}

opsTokenRoutes.get("/ops-tokens", async (_req, res) => {
    const tokens = await db.opsToken.findMany({
        orderBy: { createdAt: "desc" },
    });
    res.json(tokens.map(toTokenInfo));
});

opsTokenRoutes.post("/ops-tokens", async (req, res) => {
    const input = parse(opsTokenBody, req.body);
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt.getTime() <= Date.now())
        throw badRequest("过期时间须晚于当前时间。");
    const actorId = currentUser(req).id;
    const secret = `${TOKEN_PREFIX}${newToken()}`;
    const row = await db.$transaction(async (tx) => {
        const token = await tx.opsToken.create({
            data: {
                name: input.name,
                expiresAt,
                allowedIps: [
                    ...new Set(
                        input.allowedIps.map((ip) => canonicalIp(ip) ?? ip),
                    ),
                ],
                scopes: [...new Set(input.scopes)],
                tokenHash: sessionDigest(secret),
                createdById: actorId,
            },
        });
        await audit(
            tx,
            actorId,
            "ops.token_create",
            token.id,
            toTokenInfo(token),
        );
        return token;
    });
    res.status(201).json({ ...toTokenInfo(row), token: secret });
});

opsTokenRoutes.delete("/ops-tokens/:id", async (req, res) => {
    const id = parse(uuidParam, req.params.id);
    await db.$transaction(
        async (tx) => {
            const changed = await tx.opsToken.updateMany({
                where: { id, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            if (!changed.count) {
                if (
                    !(await tx.opsToken.findUnique({
                        where: { id },
                        select: { id: true },
                    }))
                )
                    throw notFound("运维令牌不存在。");
                return;
            }
            await audit(tx, currentUser(req).id, "ops.token_revoke", id);
        },
        { timeout: 35_000 },
    );
    res.json({ ok: true });
});
