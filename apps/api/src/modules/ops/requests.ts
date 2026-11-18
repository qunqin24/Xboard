import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
} from "node:crypto";
import { opsIdempotencyKey } from "@xboard/contracts";
import type { Request } from "express";
import { db, type Tx } from "../../db";
import {
    badRequest,
    conflict,
    describeHttpError,
    errorBody,
    HttpError,
} from "../../http/errors";
import { parse } from "../../http/validate";
import { opsAuditDetail, recordOpsCall } from "./audit";
import { checkCredential, lockCredential } from "./tokens";

export function responseKey(secret: string) {
    return createHmac("sha256", secret)
        .update("Xboard ops responses v1")
        .digest();
}

export function serializeOpsBody(body: unknown) {
    return JSON.stringify(body, (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
    );
}

function canonicalJson(value: unknown) {
    return JSON.stringify(value, (_key, item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
            return item;
        return Object.fromEntries(
            Object.entries(item).sort(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0,
            ),
        );
    });
}

function encode(key: Buffer, context: string, body: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([
        cipher.update(body, "utf8"),
        cipher.final(),
    ]);
    return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
}

function decode(key: Buffer, context: string, response: Uint8Array) {
    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        response.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(response.subarray(12, 28));
    return Buffer.concat([
        decipher.update(response.subarray(28)),
        decipher.final(),
    ]).toString("utf8");
}

/** One transaction owns the idempotency record, observed changes and final audit result. */
export async function executeOpsWrite(
    req: Request,
    successStatus: number,
    write: (tx: Tx) => Promise<unknown>,
) {
    const context = req.ops!;
    const tokenId = context.token!.id;
    const replayKey = context.replayKey!;
    const header = req.get("Idempotency-Key");
    if (!header) throw badRequest("写操作须提供 Idempotency-Key。");
    const key = parse(opsIdempotencyKey, header).toLowerCase();
    const fingerprint = createHmac("sha256", replayKey)
        .update("request\0")
        .update(
            canonicalJson([
                req.method,
                context.endpoint,
                req.params,
                req.query,
                req.body,
            ]),
        )
        .digest("hex");
    const lockKey = `ops:${tokenId}:${key}`;
    const responseContext = (status: number) =>
        `${lockKey}:${fingerprint}:${status}`;

    return db.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
            checkCredential(
                await lockCredential(tx, tokenId),
                context.clientIp,
                "admin:write",
            );
            const prior = await tx.opsWriteRequest.findUnique({
                where: { tokenId_key: { tokenId, key } },
            });
            if (prior) {
                if (prior.fingerprint !== fingerprint)
                    throw conflict("此幂等键已用于另一项请求。");
                const body = decode(
                    replayKey,
                    responseContext(prior.status),
                    prior.response,
                );
                await recordOpsCall(tx, req, prior.status, true);
                return { status: prior.status, body, replayed: true };
            }

            const call = await recordOpsCall(tx, req, successStatus);
            await tx.$executeRaw`SAVEPOINT ops_write`;
            await tx.$queryRaw`SELECT set_config('xboard.ops_audit_id', ${String(call.id)}, true)`;
            let status = successStatus;
            let body: string;
            try {
                body = serializeOpsBody(await write(tx));
            } catch (error) {
                const described = describeHttpError(error);
                if (described.status >= 500) throw error;
                await tx.$executeRaw`ROLLBACK TO SAVEPOINT ops_write`;
                status = described.status;
                body = JSON.stringify(
                    errorBody(
                        status,
                        described.message,
                        error instanceof HttpError ? error.code : undefined,
                    ),
                );
                await tx.audit.update({
                    where: { id: call.id },
                    data: { detail: opsAuditDetail(req, status) },
                });
            }
            await tx.$executeRaw`RELEASE SAVEPOINT ops_write`;
            await tx.opsWriteRequest.create({
                data: {
                    tokenId,
                    key,
                    fingerprint,
                    status,
                    response: encode(replayKey, responseContext(status), body),
                },
            });
            return { status, body, replayed: false };
        },
        { timeout: 30_000 },
    );
}
