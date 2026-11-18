import { Router } from "express";
import { settingsBody } from "@xboard/contracts";
import { getSmtpConfig } from "../../config";
import { db } from "../../db";
import { badRequest } from "../../http/errors";
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { readSettings, writeSettings } from "../site/service";
import { audit } from "./shared";

export const settingsRoutes = Router();

settingsRoutes.get("/settings", async (_req, res) => {
    res.json(await readSettings());
});

settingsRoutes.put("/settings", async (req, res) => {
    const next = parse(settingsBody, req.body);
    const actor = currentUser(req);
    // Requiring codes without mail would lock everyone out of sign-up.
    if (next.emailCodeRequired && !getSmtpConfig())
        throw badRequest("邮件服务尚未配置，无法开启注册验证码。");
    if ((next.expiryReminders || next.trafficReminders) && !getSmtpConfig())
        throw badRequest("邮件服务尚未配置，无法开启订阅提醒。");
    if (next.emailDomainMode === "allow" && next.emailDomains.length === 0)
        throw badRequest("仅允许指定域名时，请至少填写一个域名。");
    await db.$transaction(async (tx) => {
        if (next.trialPlanId !== null) {
            const plan = await tx.plan.findFirst({
                where: { id: next.trialPlanId, deletedAt: null },
            });
            if (!plan) throw badRequest("试用套餐不存在或已删除。");
        }
        const before = await readSettings(tx);
        await writeSettings(tx, next);
        await audit(tx, actor.id, "settings.update", "site", {
            before,
            after: next,
        });
    });
    res.json(next);
});
