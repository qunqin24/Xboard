import { OPS_API_PREFIX, OPS_REQUESTS_PER_MINUTE } from "@xboard/contracts";
import { json, Router, type ErrorRequestHandler, type Response } from "express";
import { db } from "../../db";
import { describeHttpError, notFound, unauthorized } from "../../http/errors";
import { clientKey, hitRateLimit, tooMany } from "../../http/rate-limit";
import { log } from "../../logging";
import { adminOperations } from "../admin/routes";
import { recordOpsCall, startOpsCall } from "./audit";
import { responseKey } from "./requests";
import {
    canonicalIp,
    checkCredential,
    findCredential,
    readBearer,
} from "./tokens";

export const opsRoutes = Router();

async function enforceOpsLimit(key: string, res: Response) {
    const limit = await hitRateLimit(
        key,
        60_000,
        OPS_REQUESTS_PER_MINUTE,
        60_000,
    );
    if (limit.blocked) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        throw tooMany(limit.retryAfterSeconds);
    }
}

opsRoutes.use(async (req, res, next) => {
    const context = startOpsCall(req, res);
    context.clientIp = canonicalIp(req.ip);
    await enforceOpsLimit(`ops:ip:${clientKey(context.clientIp)}`, res);

    const header = req.get("Authorization");
    const secret = readBearer(header);
    const credential = secret ? await findCredential(secret) : null;
    if (!secret || !credential) {
        const reason =
            header === undefined ? "missing" : secret ? "unknown" : "malformed";
        log("warn", "ops.auth_failed", {
            requestId: context.requestId,
            sourceIp: context.clientIp ?? null,
            method: req.method,
            route: context.endpoint
                ? `${OPS_API_PREFIX}${context.endpoint}`
                : null,
            reason,
        });
        throw unauthorized(
            secret
                ? "运维令牌无效、已过期或已吊销。"
                : "请提供有效的 Bearer 运维令牌。",
        );
    }

    context.token = credential;
    const scope =
        req.method === "GET" || req.method === "HEAD"
            ? "admin:read"
            : "admin:write";
    checkCredential(credential, context.clientIp, scope);
    await enforceOpsLimit(`ops:token:${credential.id}`, res);
    if (scope === "admin:write") context.replayKey = responseKey(secret);
    next();
});
opsRoutes.use(json({ limit: "1mb" }));
opsRoutes.use(adminOperations);
opsRoutes.use(() => {
    throw notFound("接口不存在。");
});

const auditError: ErrorRequestHandler = async (
    error: unknown,
    req,
    _res,
    next,
) => {
    if (req.ops?.token)
        await recordOpsCall(db, req, describeHttpError(error).status);
    next(error);
};
opsRoutes.use(auditError);
