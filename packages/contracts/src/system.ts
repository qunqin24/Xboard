import { z } from "zod";
import { emailSchema } from "./common";
import { registerBody } from "./auth";
import { twoFactorCodeSchema } from "./security";

const text = (length: number) => z.string().trim().max(length).default("");
const secret = z.string().min(1).max(2048).nullable().optional();

const mailFields = z.strictObject({
    smtpHost: text(253),
    smtpPort: z.number().int().min(1).max(65535).default(587),
    smtpSecure: z.boolean().default(false),
    smtpUser: text(254),
    mailFrom: text(320),
});
export const mailSettingsBody = mailFields.extend({ smtpPassword: secret });
export const mailSettingsSchema = mailFields.extend({
    smtpPasswordSet: z.boolean(),
});
export const alertSettingsBody = z.strictObject({
    alertWebhookUrl: z
        .url({ protocol: /^https$/ })
        .max(2048)
        .nullable()
        .optional(),
});
export const alertSettingsSchema = z.strictObject({
    alertWebhookUrlSet: z.boolean(),
});

const backupFields = z.strictObject({
    backupEnabled: z.boolean().default(false),
    backupTime: z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
        .default("04:00"),
    backupStorage: z.enum(["r2", "s3"]).default("r2"),
    backupR2AccountId: text(64),
    backupR2Jurisdiction: z.enum(["default", "eu"]).default("default"),
    backupS3Endpoint: text(500),
    backupS3Region: text(64),
    backupS3ForcePathStyle: z.boolean().default(false),
    backupBucket: text(128),
    backupPrefix: text(256),
    backupAccessKeyId: text(254),
    backupAgeRecipient: text(80),
});
export const backupSettingsBody = backupFields.extend({
    backupSecretAccessKey: secret,
});
export const backupSettingsSchema = backupFields.extend({
    backupSecretAccessKeySet: z.boolean(),
});
export const captchaProvider = z.enum([
    "off",
    "turnstile",
    "recaptcha",
    "hcaptcha",
]);
export const captchaPublicSchema = z.strictObject({
    captchaProvider: captchaProvider.default("off"),
    captchaSiteKey: text(256),
    captchaOnRegister: z.boolean().default(true),
    captchaOnLogin: z.boolean().default(false),
    captchaOnPasswordReset: z.boolean().default(true),
});
export type CaptchaSettings = z.infer<typeof captchaPublicSchema>;
export const captchaSettingsBody = captchaPublicSchema.extend({
    captchaSecretKey: secret,
});
export const captchaSettingsSchema = captchaPublicSchema.extend({
    captchaSecretKeySet: z.boolean(),
});

const commissionFields = z.strictObject({
    commissionEnabled: z.boolean().default(false),
    commissionRateBasisPoints: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .default(1000),
    commissionFirstOrderOnly: z.boolean().default(true),
    withdrawEnabled: z.boolean().default(false),
    withdrawMinMinor: z
        .number()
        .int()
        .positive()
        .max(100_000_000)
        .default(10_000),
    withdrawMethods: z
        .array(z.string().trim().min(1).max(48))
        .max(20)
        .default([]),
});
export const commissionSettingsBody = commissionFields;

export const setupBody = z.strictObject({
    email: emailSchema,
    password: registerBody.shape.password,
    code: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{43}$/),
});
export const testEmailBody = z.strictObject({ to: emailSchema });
export const exportKeyBody = z.strictObject({
    password: z.string().min(1).max(256),
    twoFactorCode: twoFactorCodeSchema.optional(),
});
export const exportedKeySchema = z.strictObject({ appKey: z.string() });

export const operationalGroups = {
    captcha: {
        input: captchaSettingsBody,
        output: captchaSettingsSchema,
        secret: "captchaSecretKey",
    },
    mail: {
        input: mailSettingsBody,
        output: mailSettingsSchema,
        secret: "smtpPassword",
    },
    alerts: {
        input: alertSettingsBody,
        output: alertSettingsSchema,
        secret: "alertWebhookUrl",
    },
    backup: {
        input: backupSettingsBody,
        output: backupSettingsSchema,
        secret: "backupSecretAccessKey",
    },
} as const;
export type OperationalGroup = keyof typeof operationalGroups;
export const operationalGroupNames = Object.keys(
    operationalGroups,
) as OperationalGroup[];

export const backupRunSchema = z.object({
    id: z.uuid(),
    status: z.enum(["pending", "completed", "failed"]),
    createdAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    bytes: z.string().nullable(),
    objects: z.array(z.string()),
});
export type BackupRun = z.infer<typeof backupRunSchema>;
