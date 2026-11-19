import { requireCaptcha } from "../auth/captcha";
import { Router } from "express";
import {
    forgotBody,
    passwordBody,
    resetBody,
    trafficDailyQuery,
    verifyBody,
} from "@xboard/contracts";
import { db } from "../../db";
import { enforce, rateLimit } from "../../http/rate-limit";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import {
    changePassword,
    consumeEmailLink,
    dailyTraffic,
    listLedger,
    listTraffic,
    requireMail,
    rotateProxyCredentials,
    sendEmailLink,
    toAccount,
} from "./service";
import { getInvite, resetInvite } from "./invite";

export const accountRoutes = Router();

accountRoutes.get("/account", requireUser, async (req, res) => {
    res.json(await toAccount(currentUser(req)));
});

accountRoutes.post(
    "/auth/forgot",
    rateLimit({ limit: 3, windowMs: 60_000, scope: "forgot" }),
    async (req, res) => {
        await requireMail();
        const { email, captchaToken } = parse(forgotBody, req.body);
        await requireCaptcha("forgot", captchaToken, req.ip);
        // Per mailbox as well, so many IPs cannot flood one inbox.
        await enforce(`forgot:${email}`, 60 * 60_000, 5);
        const user = await db.user.findUnique({ where: { email } });
        if (user && !user.banned) await sendEmailLink(user, "reset");
        // Same answer whether or not the account exists.
        res.status(201).json({
            ok: true,
            message: "如果账户存在，重置邮件将发送到该邮箱。",
        });
    },
);

accountRoutes.post(
    "/account/verify-email",
    rateLimit({ limit: 3, windowMs: 60_000, scope: "verify-email" }),
    requireUser,
    async (req, res) => {
        await requireMail();
        const user = currentUser(req);
        if (!user.verifiedAt) await sendEmailLink(user, "verify");
        res.status(201).json({ ok: true });
    },
);

accountRoutes.post("/auth/reset", async (req, res) => {
    const input = parse(resetBody, req.body);
    await consumeEmailLink(input.token, "reset", input.password);
    res.status(201).json({ ok: true });
});

accountRoutes.post("/auth/verify", async (req, res) => {
    const input = parse(verifyBody, req.body);
    await consumeEmailLink(input.token, "verify");
    res.status(201).json({ ok: true });
});

accountRoutes.post("/account/password", requireUser, async (req, res) => {
    const input = parse(passwordBody, req.body);
    await changePassword(currentUser(req), input.oldPassword, input.password);
    res.status(201).json({ ok: true });
});

accountRoutes.post("/account/credentials", requireUser, async (req, res) => {
    await rotateProxyCredentials(currentUser(req).id);
    res.status(201).json({ ok: true });
});

accountRoutes.get("/account/ledger", requireUser, async (req, res) => {
    res.json(await listLedger(currentUser(req).id));
});

accountRoutes.get("/account/traffic", requireUser, async (req, res) => {
    res.json(await listTraffic(currentUser(req).id));
});

accountRoutes.get("/account/traffic/daily", requireUser, async (req, res) => {
    const { days } = parse(trafficDailyQuery, req.query);
    res.json(await dailyTraffic(currentUser(req).id, days));
});

accountRoutes.get("/account/invite", requireUser, async (req, res) => {
    res.json(await getInvite(currentUser(req).id));
});

accountRoutes.post(
    "/account/invite/reset",
    rateLimit({ limit: 5, windowMs: 60_000, scope: "invite-reset" }),
    requireUser,
    async (req, res) => {
        res.status(201).json(await resetInvite(currentUser(req).id));
    },
);
