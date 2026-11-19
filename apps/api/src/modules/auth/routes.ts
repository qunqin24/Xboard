import { Router, type CookieOptions } from "express";
import { loginBody, registerBody, registerCodeBody } from "@xboard/contracts";
import { getConfig } from "../../config";
import { parse } from "../../http/validate";
import { enforce, rateLimit } from "../../http/rate-limit";
import { defaultLocale, requestLocale } from "../site/language";
import { requireMail } from "../account/service";
import { requireCaptcha } from "./captcha";
import { register, sendRegisterCode } from "./registration";
import { login, logout, SESSION_COOKIE, SESSION_TTL_SECONDS } from "./service";

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
        await requireCaptcha("register", input.captchaToken, req.ip);
        res.status(201).json(
            await register(
                input,
                req.ip,
                requestLocale(req) ?? (await defaultLocale()),
            ),
        );
    },
);

authRoutes.post(
    "/auth/register/code",
    rateLimit({ limit: 3, windowMs: 60_000, scope: "register-code" }),
    async (req, res) => {
        await requireMail();
        const { email, captchaToken } = parse(registerCodeBody, req.body);
        await requireCaptcha("register_code", captchaToken, req.ip);
        // Per mailbox as well, so many IPs cannot flood one inbox.
        await enforce(`register-code:${email}`, 60 * 60_000, 5);
        res.status(201).json({
            retryAfterSeconds: await sendRegisterCode(
                email,
                requestLocale(req) ?? (await defaultLocale()),
            ),
        });
    },
);

authRoutes.post(
    "/auth/login",
    rateLimit({ limit: 5, windowMs: 60_000, scope: "login" }),
    async (req, res) => {
        const input = parse(loginBody, req.body);
        await requireCaptcha("login", input.captchaToken, req.ip);
        const result = await login(input.email, input.password, {
            twoFactorCode: input.twoFactorCode,
            userAgent: req.get("User-Agent"),
        });
        res.cookie(SESSION_COOKIE, result.token, {
            ...cookieOptions(),
            maxAge: SESSION_TTL_SECONDS * 1000,
        });
        res.json({
            email: result.email,
            ...(result.locale && { locale: result.locale }),
        });
    },
);

authRoutes.post("/auth/logout", async (req, res) => {
    await logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
});
