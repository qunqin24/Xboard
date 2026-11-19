import { Router } from "express";
import { exportKeyBody } from "@xboard/contracts";
import { db, lockUser } from "../../db";
import { badRequest, unauthorized } from "../../http/errors";
import { testBackupStorage } from "../../jobs/backup";
import { enforce } from "../../http/rate-limit";
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { errorFields, log, sendAlertWebhook } from "../../logging";
import { audit } from "../admin/shared";
import { verifyPassword } from "../auth/password";
import { factorUpdate } from "../auth/totp";
import {
    releaseTwoFactorAttempt,
    reserveTwoFactorAttempt,
} from "../auth/two-factor-limit";
import { applicationKey } from "./secrets";
import { getSettingSecret } from "./settings";

export const systemAdminRoutes = Router();

systemAdminRoutes.post("/settings/alerts/test", async (req, res) => {
    const actorId = currentUser(req).id;
    const url = await getSettingSecret("alertWebhookUrl");
    if (!url) throw badRequest("请先配置告警地址。");
    try {
        await sendAlertWebhook(url, { event: "alert.test" });
    } catch (error) {
        log("warn", "alert.test_failed", { error: errorFields(error) });
        throw badRequest("告警发送失败，请检查地址和接收服务。");
    }
    await audit(db, actorId, "settings.alert_test", "alerts");
    res.json({ ok: true });
});

systemAdminRoutes.post("/settings/application-key", async (req, res) => {
    const userId = currentUser(req).id;
    const input = parse(exportKeyBody, req.body);
    await enforce(`application-key:${userId}`, 15 * 60_000, 5);
    const appKey = await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (
            user.role !== "admin" ||
            user.banned ||
            !(await verifyPassword(input.password, user.password))
        )
            throw unauthorized("管理员认证失败。");
        if (user.totpSecret) {
            if (!input.twoFactorCode)
                throw unauthorized("请输入动态验证码或恢复码。");
            await reserveTwoFactorAttempt(userId);
            const update = factorUpdate(user, input.twoFactorCode, new Date());
            if (!update) throw unauthorized("动态验证码或恢复码无效。");
            await tx.user.update({ where: { id: userId }, data: update });
            await releaseTwoFactorAttempt(userId);
        }
        const key = applicationKey();
        await audit(
            tx,
            userId,
            "settings.application_key_export",
            "application-key",
        );
        return key;
    });
    res.json({ appKey });
});

systemAdminRoutes.post("/settings/backup/test", async (req, res) => {
    const actorId = currentUser(req).id;
    try {
        await testBackupStorage();
    } catch (error) {
        log("warn", "backup.test_failed", { error: errorFields(error) });
        throw badRequest("存储连接测试失败，请检查配置和存储权限。");
    }
    await audit(db, actorId, "settings.backup_test", "backup");
    res.json({ ok: true });
});
