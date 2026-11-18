import { z } from "zod";
import { bytesSchema, idSchema, periodSchema } from "./common";
import { couponCodeSchema } from "./promotions";

const orderTarget = {
    planId: idSchema,
    /** Reuse the same id when retrying one purchase; the server dedupes on it. */
    requestId: z.uuid({ version: "v4" }),
};
export const createOrderBody = z.union([
    z.strictObject({
        ...orderTarget,
        kind: z.literal("subscription").optional(),
        period: periodSchema,
        couponCode: couponCodeSchema.optional(),
    }),
    z.strictObject({
        ...orderTarget,
        kind: z.literal("traffic_reset"),
    }),
]);
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderStatusSchema = z.enum(["pending", "paid", "cancelled"]);
export const orderKindSchema = z.enum(["subscription", "traffic_reset"]);

export const orderSchema = z.object({
    id: z.string(),
    planName: z.string(),
    kind: orderKindSchema,
    period: periodSchema.nullable(),
    status: orderStatusSchema,
    amountMinor: z.number().int(),
    creditMinor: z.number().int().nonnegative(),
    discountMinor: z.number().int().nonnegative(),
    replacesPlan: z.boolean(),
    /** Positive means a deduction, negative means a refund to balance. */
    payableMinor: z.number().int(),
    transferBytes: bytesSchema,
    durationDays: z.number().int(),
    createdAt: z.string(),
    expiresAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;
