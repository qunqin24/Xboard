import { json, Router, type ErrorRequestHandler } from "express";
import { db } from "../../db";
import { describeHttpError, notFound, unauthorized } from "../../http/errors";
import { hitRateLimit, tooMany } from "../../http/rate-limit";
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

opsRoutes.use(async (req, res, next) => {
    const context = startOpsCall(req, res);
    const secret = readBearer(req.get("Authorization"));
    if (!secret) throw unauthorized("请提供有效的 Bearer 运维令牌。");
    const credential = await findCredential(secret);
    context.token = credential ?? undefined;
    context.clientIp = canonicalIp(req.ip);
    const scope =
        req.method === "GET" || req.method === "HEAD"
            ? "admin:read"
            : "admin:write";
    checkCredential(credential, context.clientIp, scope);
    const limit = await hitRateLimit(
        `ops:token:${credential.id}`,
        60_000,
        120,
        60_000,
    );
    if (limit.blocked) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        throw tooMany(limit.retryAfterSeconds);
    }
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
    await recordOpsCall(db, req, describeHttpError(error).status);
    next(error);
};
opsRoutes.use(auditError);
