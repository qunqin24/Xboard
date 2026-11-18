import { Router, type CookieOptions } from "express";
import { loginBody, registerBody } from "@xboard/contracts";
import { getConfig } from "../../config";
import { parse } from "../../http/validate";
import { rateLimit } from "../../http/rate-limit";
import {
    login,
    logout,
    register,
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
} from "./service";

export const authRoutes = Router();

function cookieOptions(): CookieOptions {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: getConfig().production,
        path: "/api",
    };
}

authRoutes.post(
    "/auth/register",
    rateLimit({ limit: 3, windowMs: 60_000, scope: "register" }),
    async (req, res) => {
        const input = parse(registerBody, req.body);
        res.status(201).json(await register(input.email, input.password));
    },
);

authRoutes.post(
    "/auth/login",
    rateLimit({ limit: 5, windowMs: 60_000, scope: "login" }),
    async (req, res) => {
        const input = parse(loginBody, req.body);
        const result = await login(input.email, input.password);
        res.cookie(SESSION_COOKIE, result.token, {
            ...cookieOptions(),
            maxAge: SESSION_TTL_SECONDS * 1000,
        });
        res.json({ email: result.email });
    },
);

authRoutes.post("/auth/logout", async (req, res) => {
    await logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
});
