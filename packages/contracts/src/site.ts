import { z } from "zod";
import { idSchema } from "./common";

/** "Example.COM" → "example.com"; a leading "@" or "*." is dropped. */
export function normalizeDomain(value: string): string {
    return value.trim().toLowerCase().replace(/^@/, "").replace(/^\*\./, "");
}

export const emailDomainSchema = z
    .string()
    .transform(normalizeDomain)
    .pipe(
        z
            .string()
            .max(253, "域名过长")
            .regex(
                /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/,
                "域名格式不正确，例如 example.com",
            ),
    );

/** An http(s) link, or empty for none. */
const optionalUrl = z
    .string()
    .trim()
    .max(500, "链接最多 500 个字符")
    .refine(
        (value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value),
        "链接需以 http:// 或 https:// 开头",
    );

export const emailDomainModeSchema = z.enum(["off", "allow", "deny"]);
export type EmailDomainMode = z.infer<typeof emailDomainModeSchema>;

/** Every site setting, as the admin edits it. */
export const settingsBody = z.strictObject({
    siteName: z
        .string()
        .trim()
        .min(1, "请输入站点名称")
        .max(40, "站点名称最多 40 个字"),
    registrationOpen: z.boolean(),
    supportNote: z.string().max(500, "客服说明最多 500 字"),
    /** Sign-up needs another user's invite code. */
    inviteOnly: z.boolean(),
    /** Sign-up needs a code mailed to the address; the account starts verified. */
    emailCodeRequired: z.boolean(),
    emailDomainMode: emailDomainModeSchema,
    /** Lowercase domains; a rule also covers its subdomains. */
    emailDomains: z
        .array(emailDomainSchema)
        .max(500, "域名最多 500 个")
        .transform((domains) => [...new Set(domains)]),
    /** Treat Gmail dot and plus aliases as the mailbox they deliver to. */
    gmailAliasCheck: z.boolean(),
    /** New accounts per client address in 24 hours; 0 means no cap. */
    registerIpDailyLimit: z
        .number()
        .int("请输入整数")
        .min(0, "不能小于 0")
        .max(1000, "不能大于 1000"),
    /** Plan granted on sign-up; null for none. */
    trialPlanId: idSchema.nullable(),
    trialDays: z
        .number()
        .int("请输入整数")
        .min(1, "至少 1 天")
        .max(365, "最多 365 天"),
    termsUrl: optionalUrl,
    privacyUrl: optionalUrl,
    expiryReminders: z.boolean().default(false),
    trafficReminders: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsBody>;
export const settingsSchema = settingsBody;

/** The public subset every visitor can read. */
export const siteSchema = z.object({
    siteName: z.string(),
    registrationOpen: z.boolean(),
    supportNote: z.string(),
    inviteOnly: z.boolean(),
    emailCodeRequired: z.boolean(),
    termsUrl: z.string(),
    privacyUrl: z.string(),
});
export type Site = z.infer<typeof siteSchema>;
