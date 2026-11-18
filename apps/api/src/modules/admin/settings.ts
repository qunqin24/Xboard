import { Router } from "express";
import { settingsBody } from "@xboard/contracts";
import { getSmtpConfig } from "../../config";
import { badRequest } from "../../http/errors";
import { parse } from "../../http/validate";
import { readSettings, writeSettings } from "../site/service";
import { audit } from "./shared";
import { adminActorId, adminRead, adminWrite } from "./operations";

export const settingsRoutes = Router();

settingsRoutes.get(
    "/settings",
    adminRead(async (_req) => {
        return await readSettings();
    }),
);

settingsRoutes.put(
    "/settings",
    adminWrite(200, async (req, tx) => {
        const next = parse(settingsBody, req.body);
        const actorId = adminActorId(req);
        // Requiring codes without mail would lock everyone out of sign-up.
        if (next.emailCodeRequired && !getSmtpConfig())
            throw badRequest("邮件服务尚未配置，无法开启注册验证码。");
        if ((next.expiryReminders || next.trafficReminders) && !getSmtpConfig())
            throw badRequest("邮件服务尚未配置，无法开启订阅提醒。");
        if (next.emailDomainMode === "allow" && next.emailDomains.length === 0)
            throw badRequest("仅允许指定域名时，请至少填写一个域名。");
        if (next.trialPlanId !== null) {
            const plan = await tx.plan.findFirst({
                where: { id: next.trialPlanId, deletedAt: null },
            });
            if (!plan) throw badRequest("试用套餐不存在或已删除。");
        }
        const before = await readSettings(tx);
        await writeSettings(tx, next);
        await audit(tx, actorId, "settings.update", "site", {
            before,
            after: next,
        });
        return next;
    }),
);
