import type { RequestHandler } from "express";
import type { Config } from "../config";
import { errorBody } from "./errors";

// Nodes call these from servers, which send no Origin header.
const NODE_WRITES = [
    /^\/api\/v1\/server\/UniProxy\/(push|alive|status)(\?|$)/,
    /^\/api\/v1\/server\/(Deepbwork|TrojanTidalab|ShadowsocksTidalab)\/submit(\?|$)/,
];
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Cross-site request protection for cookie-authenticated writes: a write must
 * carry an Origin header equal to APP_ORIGIN. In development the same port on
 * any loopback name also counts (localhost vs 127.0.0.1 in the address bar).
 */
export function originCheck(config: Config): RequestHandler {
    const allowed = new Set([config.origin]);
    if (config.environment === "development") {
        const local = new URL(config.origin);
        if (LOOPBACK.includes(local.hostname))
            for (const hostname of LOOPBACK) {
                local.hostname = hostname;
                allowed.add(local.origin);
            }
    }
    return (req, res, next) => {
        const write = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
        if (
            write &&
            !NODE_WRITES.some((pattern) => pattern.test(req.originalUrl)) &&
            (!allowed.has(req.headers.origin ?? "") ||
                req.headers["sec-fetch-site"] === "cross-site")
        ) {
            res.status(403).json(
                errorBody(403, "请求来源不受信任，请从用户端操作。"),
            );
            return;
        }
        next();
    };
}
