import { db } from "../../db";
import { backupView } from "../../jobs/backup";
import { Router } from "express";
import {
    operationalGroupNames,
    settingsBody,
    testEmailBody,
} from "@xboard/contracts";
import { badRequest } from "../../http/errors";
import { parse } from "../../http/validate";
import { readSettings, writeSettings } from "../site/service";
import { audit } from "./shared";
import { adminActorId, adminRead, adminWrite } from "./operations";
import {
    getSmtpConfig,
    readOperationalGroup,
    saveOperationalGroup,
} from "../system/settings";

export const settingsRoutes = Router();

const readSite = adminRead(async () => readSettings());
settingsRoutes.get("/settings", readSite);
settingsRoutes.get("/settings/site", readSite);

const saveSite = adminWrite(200, async (req, tx) => {
    const next = parse(settingsBody, req.body);
    const actorId = adminActorId(req);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('settings:mail'))::text`;
    const smtp =
        next.emailCodeRequired || next.expiryReminders || next.trafficReminders
            ? await getSmtpConfig(tx)
            : null;
    if (next.emailCodeRequired && !smtp)
        throw badRequest("邮件服务尚未配置，无法开启注册验证码。");
    if ((next.expiryReminders || next.trafficReminders) && !smtp)
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
});
settingsRoutes.put("/settings", saveSite);
settingsRoutes.put("/settings/site", saveSite);

for (const group of operationalGroupNames) {
    settingsRoutes.get(
        `/settings/${group}`,
        adminRead(async () => readOperationalGroup(group)),
    );
    settingsRoutes.put(
        `/settings/${group}`,
        adminWrite(200, async (req, tx) =>
            saveOperationalGroup(tx, adminActorId(req), group, req.body),
        ),
    );
}

settingsRoutes.post(
    "/settings/mail/test",
    adminWrite(201, async (req, tx) => {
        const { to } = parse(testEmailBody, req.body);
        if (!(await getSmtpConfig(tx))) throw badRequest("请先配置邮件服务。");
        await tx.mail.create({
            data: {
                to,
                subject: "Xboard 测试邮件",
                text: "邮件服务配置测试成功。",
            },
        });
        await audit(tx, adminActorId(req), "settings.mail_test", "mail");
        return { ok: true };
    }),
);

settingsRoutes.get(
    "/settings/backup/runs",
    adminRead(async () =>
        (
            await db.backupRun.findMany({
                orderBy: { createdAt: "desc" },
                take: 20,
            })
        ).map(backupView),
    ),
);
settingsRoutes.post(
    "/settings/backup/runs",
    adminWrite(201, async (req, tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('xboard:backup-queue'))::text`;
        const pending = await tx.backupRun.findFirst({
            where: { status: "pending" },
            orderBy: { createdAt: "asc" },
        });
        if (pending) return backupView(pending);
        const backup = await tx.backupRun.create({ data: {} });
        await audit(tx, adminActorId(req), "settings.backup_queued", backup.id);
        return backupView(backup);
    }),
);
