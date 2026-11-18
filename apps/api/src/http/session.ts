import type { Request, RequestHandler } from "express";
import type { User } from "@prisma/client";
import { authenticate, SESSION_COOKIE } from "../modules/auth/service";
import { forbidden, unauthorized } from "./errors";

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** Set by requireUser / requireAdmin. */
            user?: User;
        }
    }
}

/** Reject the request with 401 unless it carries a valid session cookie. */
export const requireUser: RequestHandler = async (req, _res, next) => {
    req.user = await authenticate(req.cookies?.[SESSION_COOKIE]);
    next();
};

/** requireUser, then 403 unless the user is an admin. */
export const requireAdmin: RequestHandler = async (req, _res, next) => {
    const user = await authenticate(req.cookies?.[SESSION_COOKIE]);
    if (user.role !== "admin") throw forbidden("需要管理员权限。");
    req.user = user;
    next();
};

/** The user that requireUser attached. */
export function currentUser(req: Request): User {
    if (!req.user) throw unauthorized("请先登录。");
    return req.user;
}
