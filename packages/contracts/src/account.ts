import { z } from "zod";
import { bytesSchema } from "./common";
import { planSchema, trafficResetModeSchema } from "./plans";

export const accountSchema = z.object({
    email: z.string(),
    role: z.enum(["user", "admin"]),
    emailVerified: z.boolean(),
    twoFactorEnabled: z.boolean(),
    balanceMinor: z.number().int(),
    speedLimitMbps: z.number().int().nullable(),
    deviceLimit: z.number().int().nullable(),
    uploadBytes: bytesSchema,
    downloadBytes: bytesSchema,
    transferBytes: bytesSchema,
    /** Unix seconds; null means no expiry. */
    expiredAt: z.number().int().nullable(),
    trafficResetMode: trafficResetModeSchema,
    nextTrafficResetAt: z.string().nullable(),
    plan: planSchema.nullable(),
});
export type Account = z.infer<typeof accountSchema>;

export const passwordBody = z.strictObject({
    oldPassword: z.string().min(1, "请输入当前密码").max(256),
    password: z
        .string()
        .min(12, "新密码至少 12 个字符")
        .max(128, "新密码最多 128 个字符"),
});

export const ledgerItemSchema = z.object({
    id: z.string(),
    amountMinor: z.number().int(),
    reason: z.string().nullable(),
    orderId: z.string().nullable(),
    createdAt: z.string(),
});
export type LedgerItem = z.infer<typeof ledgerItemSchema>;

export const trafficItemSchema = z.object({
    id: z.string().regex(/^[1-9]\d*$/),
    upload: bytesSchema,
    download: bytesSchema,
    createdAt: z.string(),
    node: z.object({ name: z.string() }),
});
export type TrafficItem = z.infer<typeof trafficItemSchema>;

/** Daily totals for the usage chart: `days` Asia/Shanghai days, oldest first. */
export const trafficDailyQuery = z.object({
    days: z.coerce.number().int().min(1).max(30).default(7),
});
export const trafficDaySchema = z.object({
    /** YYYY-MM-DD in Asia/Shanghai. */
    date: z.string(),
    upload: bytesSchema,
    download: bytesSchema,
});
export type TrafficDay = z.infer<typeof trafficDaySchema>;

export const subscriptionLinksSchema = z.object({
    /** One link for every client; the format follows the client's User-Agent. */
    url: z.string(),
    mihomo: z.string(),
    singbox: z.string(),
});
export type SubscriptionLinks = z.infer<typeof subscriptionLinksSchema>;

export const inviteSchema = z.object({
    code: z.string(),
    /** Accounts registered with this user's code. */
    invitedCount: z.number().int(),
    /** The 20 newest invitees, with masked addresses. */
    recent: z.array(z.object({ email: z.string(), createdAt: z.string() })),
});
export type Invite = z.infer<typeof inviteSchema>;
