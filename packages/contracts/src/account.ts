import { z } from "zod";
import { bytesSchema } from "./common";
import { planSchema } from "./plans";

export const accountSchema = z.object({
    email: z.string(),
    role: z.enum(["user", "admin"]),
    emailVerified: z.boolean(),
    balanceMinor: z.number().int(),
    speedLimitMbps: z.number().int().nullable(),
    deviceLimit: z.number().int().nullable(),
    uploadBytes: bytesSchema,
    downloadBytes: bytesSchema,
    transferBytes: bytesSchema,
    /** Unix seconds; null means no expiry. */
    expiredAt: z.number().int().nullable(),
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
    id: z.number().int(),
    upload: bytesSchema,
    download: bytesSchema,
    createdAt: z.string(),
    node: z.object({ name: z.string() }),
});
export type TrafficItem = z.infer<typeof trafficItemSchema>;

export const subscriptionLinksSchema = z.object({
    mihomo: z.string(),
    singbox: z.string(),
});
export type SubscriptionLinks = z.infer<typeof subscriptionLinksSchema>;
