import type { Locale, MailTemplate, MailTemplateKey } from "@xboard/contracts";
import { db, type Tx } from "../../db";
import { defaultLocale } from "../site/language";
import { badRequest } from "../../http/errors";

const DEFAULTS: Record<MailTemplateKey, Omit<MailTemplate, "key">> = {
    verify_email: {
        subject: "验证你的邮箱",
        text: "请在 30 分钟内打开链接：\n{{link}}\n若非本人操作，请忽略此邮件。",
        variables: ["siteName", "link"],
        required: ["link"],
    },
    reset_password: {
        subject: "重置账户密码",
        text: "请在 30 分钟内打开链接：\n{{link}}\n若非本人操作，请忽略此邮件。",
        variables: ["siteName", "link"],
        required: ["link"],
    },
    registration_code: {
        subject: "{{siteName}} 注册验证码",
        text: "验证码：{{code}}\n10 分钟内有效，请勿告诉他人。\n若非本人操作，请忽略此邮件。",
        variables: ["siteName", "code"],
        required: ["code"],
    },
    registration_taken: {
        subject: "{{siteName}} 注册提醒",
        text: "此邮箱已注册账户，无需再次注册。如忘记密码，请在登录页选择“忘记密码”。\n若非本人操作，请忽略此邮件。",
        variables: ["siteName"],
        required: [],
    },
    expiry_reminder: {
        subject: "{{siteName}} 套餐将在 {{days}} 天内到期",
        text: "套餐将在 {{days}} 天内到期。查看套餐和续费：\n{{link}}",
        variables: ["siteName", "days", "link"],
        required: ["days"],
    },
    traffic_reminder: {
        subject: "{{siteName}} 流量已使用 {{percent}}%",
        text: "本期流量用量已达到 {{percent}}%。查看套餐：\n{{link}}",
        variables: ["siteName", "percent", "link"],
        required: ["percent"],
    },
};

const ENGLISH: Record<MailTemplateKey, { subject: string; text: string }> = {
    verify_email: {
        subject: "Verify your email address",
        text: "Open this link within 30 minutes:\n{{link}}\nIf you did not request this, ignore this email.",
    },
    reset_password: {
        subject: "Reset your account password",
        text: "Open this link within 30 minutes:\n{{link}}\nIf you did not request this, ignore this email.",
    },
    registration_code: {
        subject: "{{siteName}} registration code",
        text: "Your code is {{code}}. It expires in 10 minutes. Keep it private.\nIf you did not request this, ignore this email.",
    },
    registration_taken: {
        subject: "{{siteName}} registration notice",
        text: "An account already uses this address. To recover your account, choose Forgot password on the sign-in page.\nIf you did not request this, ignore this email.",
    },
    expiry_reminder: {
        subject: "Your {{siteName}} plan expires within {{days}} day(s)",
        text: "Your current plan expires within {{days}} day(s). View or renew your plan:\n{{link}}",
    },
    traffic_reminder: {
        subject: "You have used {{percent}}% of your {{siteName}} data",
        text: "You have used {{percent}}% of your current data allowance. View your plan:\n{{link}}",
    },
};

export function storedTemplateKey(key: MailTemplateKey, locale: Locale) {
    return locale === "en-US" ? `${key}.en-US` : key;
}

const placeholder = /\{\{([A-Za-z]+)\}\}/g;

export function validateTemplate(
    key: MailTemplateKey,
    input: { subject: string; text: string },
) {
    const { variables, required } = DEFAULTS[key];
    const used = (value: string) =>
        [...value.matchAll(placeholder)].map((match) => match[1]!);
    const subjectVariables = used(input.subject);
    const textVariables = used(input.text);
    if (
        [...subjectVariables, ...textVariables].some(
            (name) => !variables.includes(name),
        )
    )
        throw badRequest("模板包含未知变量。");
    if (
        (key === "verify_email" ||
            key === "reset_password" ||
            key === "registration_code") &&
        subjectVariables.some((name) => name === "link" || name === "code")
    )
        throw badRequest("验证码和一次性链接只能放在正文中。");
    if (required.some((name) => !textVariables.includes(name)))
        throw badRequest("邮件正文缺少必填变量。");
}

export async function readTemplates(
    keys: readonly MailTemplateKey[],
    client: Tx = db,
    locale: Locale = "zh-CN",
): Promise<MailTemplate[]> {
    const records = await client.mailTemplate.findMany({
        where: {
            key: { in: keys.map((key) => storedTemplateKey(key, locale)) },
        },
    });
    const overrides = new Map(
        records.map((row) => [
            row.key,
            { subject: row.subject, text: row.text },
        ]),
    );
    return keys.map((key) => ({
        key,
        ...DEFAULTS[key],
        ...(locale === "en-US" ? ENGLISH[key] : {}),
        ...overrides.get(storedTemplateKey(key, locale)),
    }));
}

export function renderTemplate(
    template: MailTemplate,
    values: Record<string, string | number>,
) {
    const render = (value: string) =>
        value.replace(placeholder, (match, name: string) =>
            String(values[name] ?? match),
        );
    return {
        subject: render(template.subject).replace(/[\r\n]+/g, " "),
        text: render(template.text),
    };
}

export async function enqueueTemplate(
    tx: Tx,
    key: MailTemplateKey,
    to: string,
    values: Record<string, string | number>,
    locale?: Locale,
) {
    const [template] = await readTemplates(
        [key],
        tx,
        locale ?? (await defaultLocale(tx)),
    );
    await tx.mail.create({
        data: { to, ...renderTemplate(template!, values) },
    });
}
