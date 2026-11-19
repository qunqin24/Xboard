import type { Prisma } from "@prisma/client";
import { operationalGroups, type OperationalGroup } from "@xboard/contracts";
import type { z } from "zod";
import { db, type Tx } from "../../db";
import { badRequest } from "../../http/errors";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";
import { readSettings } from "../site/service";
import { openApplicationSecret, sealApplicationSecret } from "./secrets";

type Groups = typeof operationalGroups;
type SettingSecret = Groups[OperationalGroup]["secret"];

export async function readOperationalGroup<G extends OperationalGroup>(
    group: G,
    tx: Tx = db,
) {
    const { input, output, secret } = operationalGroups[group];
    const rows = await tx.setting.findMany({
        where: { key: { in: Object.keys(input.shape) } },
    });
    const values: Record<string, unknown> = { [`${secret}Set`]: false };
    for (const { key, value } of rows) {
        if (key === secret) values[`${secret}Set`] = typeof value === "string";
        else values[key] = value;
    }
    return output.parse(values) as z.output<Groups[G]["output"]>;
}

export async function getSettingSecret(key: SettingSecret, tx: Tx = db) {
    const row = await tx.setting.findUnique({ where: { key } });
    return typeof row?.value === "string"
        ? openApplicationSecret(`setting:${key}`, row.value).toString("utf8")
        : null;
}

export async function saveOperationalGroup(
    tx: Tx,
    actorId: number,
    group: OperationalGroup,
    raw: unknown,
) {
    const { input, secret } = operationalGroups[group];
    const data = parse(input, raw) as Record<
        string,
        string | number | boolean | null | undefined
    >;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`settings:${group}`}))::text`;
    if (group === "captcha" && data.captchaProvider !== "off") {
        const hasSecret =
            data.captchaSecretKey === undefined
                ? (await readOperationalGroup("captcha", tx))
                      .captchaSecretKeySet
                : typeof data.captchaSecretKey === "string";
        if (!data.captchaSiteKey || !hasSecret)
            throw badRequest("启用人机验证须填写站点公钥与验证密钥。");
    }
    if (group === "mail") {
        if (
            data.smtpHost &&
            (!data.mailFrom || /[\r\n]/.test(String(data.mailFrom)))
        )
            throw badRequest("配置邮件服务器时须填写有效发件人。");
        if (!data.smtpHost) {
            const site = await readSettings(tx);
            if (
                site.emailCodeRequired ||
                site.expiryReminders ||
                site.trafficReminders
            )
                throw badRequest(
                    "请先关闭注册验证码和订阅提醒，再清除邮件配置。",
                );
        }
    }
    const before = await readOperationalGroup(group, tx);
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        if (key === secret && value === null) {
            await tx.setting.deleteMany({ where: { key } });
            continue;
        }
        const stored = (
            key === secret
                ? sealApplicationSecret(
                      `setting:${key}`,
                      Buffer.from(String(value)),
                  )
                : value
        ) as Prisma.InputJsonValue;
        await tx.setting.upsert({
            where: { key },
            create: { key, value: stored },
            update: { value: stored },
        });
    }
    const after = await readOperationalGroup(group, tx);
    await audit(tx, actorId, `settings.${group}_update`, group, {
        before,
        after,
        secretChanged: data[secret] !== undefined,
    });
    return after;
}

export async function getSmtpConfig(tx: Tx = db) {
    const settings = await readOperationalGroup("mail", tx);
    if (!settings.smtpHost || !settings.mailFrom) return null;
    return {
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpSecure,
        user: settings.smtpUser,
        password: (await getSettingSecret("smtpPassword", tx)) ?? undefined,
        from: settings.mailFrom,
    };
}
