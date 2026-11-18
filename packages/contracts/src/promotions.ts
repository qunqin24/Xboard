import { z } from "zod";
import { idSchema, periodSchema } from "./common";

export const couponCodeSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(
        /^[A-Z0-9][A-Z0-9_-]{3,47}$/,
        "优惠码需为 4 到 48 位字母、数字、下划线或连字符",
    );
const amount = z.number().int().min(1).max(100_000_000);
const expiresAt = z.iso.datetime().nullable();

export const couponBody = z.strictObject({
    code: couponCodeSchema,
    amountMinor: amount,
    maxUses: z.number().int().min(1).max(100_000),
    expiresAt,
});
export const couponSchema = couponBody.extend({
    id: idSchema,
    enabled: z.boolean(),
    used: z.number().int().nonnegative(),
});
export type Coupon = z.infer<typeof couponSchema>;
export const couponCreatedSchema = z.object({ id: idSchema });
export type CouponCreated = z.infer<typeof couponCreatedSchema>;

const giftBase = {
    label: z.string().trim().min(1).max(80),
    expiresAt,
};
export const giftBody = z.discriminatedUnion("kind", [
    z.strictObject({
        ...giftBase,
        kind: z.literal("balance"),
        amountMinor: amount,
    }),
    z.strictObject({
        ...giftBase,
        kind: z.literal("subscription"),
        planId: idSchema,
        period: periodSchema,
    }),
]);
export type GiftBody = z.infer<typeof giftBody>;
export const giftSchema = z.object({
    ...giftBase,
    id: idSchema,
    kind: z.enum(["balance", "subscription"]),
    amountMinor: amount.nullable(),
    planName: z.string().nullable(),
    period: periodSchema.nullable(),
    enabled: z.boolean(),
    redeemedAt: z.iso.datetime().nullable(),
});
export type Gift = z.infer<typeof giftSchema>;
export const giftCreatedSchema = z.object({ id: idSchema, code: z.string() });
export type GiftCreated = z.infer<typeof giftCreatedSchema>;

export const enabledBody = z.strictObject({ enabled: z.boolean() });
export const redeemGiftBody = z.strictObject({
    code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^GIFT-[0-9A-F]{32}$/, "兑换码格式不正确"),
});
export const redeemGiftResult = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("balance"), amountMinor: amount }),
    z.object({
        kind: z.literal("subscription"),
        planName: z.string(),
        period: periodSchema,
    }),
]);
