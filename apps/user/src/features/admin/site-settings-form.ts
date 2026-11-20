import { z } from "zod";
import {
    emailDomainSchema,
    normalizeDomain,
    settingsBody,
} from "@xboard/contracts";
import type { SiteSettings } from "./types";

const shape = settingsBody.shape;

/** Domains typed one per line (commas and spaces also separate them). */
function splitDomains(text: string): string[] {
    return text
        .split(/[\s,，、]+/)
        .map(normalizeDomain)
        .filter(Boolean);
}

const wholeNumber = (max: number, min = 0) =>
    z
        .string()
        .trim()
        .regex(/^\d{1,4}$/, "请输入整数")
        .refine((v) => Number(v) >= min, `不能小于 ${min}`)
        .refine((v) => Number(v) <= max, `不能大于 ${max}`);

export const siteSettingsSchema = z
    .object({
        siteName: shape.siteName,
        registrationOpen: z.boolean(),
        supportNote: shape.supportNote,
        inviteOnly: z.boolean(),
        emailCodeRequired: z.boolean(),
        emailDomainMode: shape.emailDomainMode,
        emailDomains: z.string().max(20_000, "内容过长"),
        gmailAliasCheck: z.boolean(),
        registerIpDailyLimit: wholeNumber(1000),
        trialPlan: z.string(),
        trialDays: wholeNumber(365, 1),
        termsUrl: shape.termsUrl,
        privacyUrl: shape.privacyUrl,
        expiryReminders: z.boolean(),
        trafficReminders: z.boolean(),
    })
    .superRefine((values, ctx) => {
        const domains = splitDomains(values.emailDomains);
        const invalid = domains.find(
            (domain) => !emailDomainSchema.safeParse(domain).success,
        );
        if (invalid)
            ctx.addIssue({
                code: "custom",
                path: ["emailDomains"],
                message: `“${invalid}”不是有效的域名`,
            });
        else if (values.emailDomainMode === "allow" && domains.length === 0)
            ctx.addIssue({
                code: "custom",
                path: ["emailDomains"],
                message: "请至少填写一个允许的域名",
            });
    });

export type Values = z.infer<typeof siteSettingsSchema>;

export function toValues(settings: SiteSettings): Values {
    return {
        ...settings,
        emailDomains: settings.emailDomains.join("\n"),
        registerIpDailyLimit: String(settings.registerIpDailyLimit),
        trialPlan:
            settings.trialPlanId === null
                ? "none"
                : String(settings.trialPlanId),
        trialDays: String(settings.trialDays),
    };
}

export function toBody(values: Values): SiteSettings {
    const { trialPlan, ...fields } = values;
    return {
        ...fields,
        siteName: values.siteName.trim(),
        emailDomains: [...new Set(splitDomains(values.emailDomains))],
        registerIpDailyLimit: Number(values.registerIpDailyLimit),
        trialPlanId: trialPlan === "none" ? null : Number(trialPlan),
        trialDays: Number(values.trialDays),
    };
}

/** The settings sections whose fields live in the shared site form. */
export const FORM_SECTIONS = ["site", "registration", "mail"] as const;
export type FormSection = (typeof FORM_SECTIONS)[number];

/** Which form fields each section shows, to flag unsaved or invalid ones. */
export const SECTION_FIELDS: Record<FormSection, (keyof Values)[]> = {
    site: ["siteName", "supportNote"],
    registration: [
        "registrationOpen",
        "inviteOnly",
        "emailCodeRequired",
        "registerIpDailyLimit",
        "emailDomainMode",
        "emailDomains",
        "gmailAliasCheck",
        "trialPlan",
        "trialDays",
        "termsUrl",
        "privacyUrl",
    ],
    mail: ["expiryReminders", "trafficReminders"],
};
