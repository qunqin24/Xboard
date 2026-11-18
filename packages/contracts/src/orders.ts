import { z } from "zod";
import { bytesSchema, idSchema, periodSchema } from "./common";

export const createOrderBody = z.strictObject({
    planId: idSchema,
    period: periodSchema,
    /** Reuse the same id when retrying one purchase; the server dedupes on it. */
    requestId: z.uuid({ version: "v4" }),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderStatusSchema = z.enum(["pending", "paid", "cancelled"]);

export const orderSchema = z.object({
    id: z.string(),
    planName: z.string(),
    period: periodSchema,
    status: orderStatusSchema,
    amountMinor: z.number().int(),
    transferBytes: bytesSchema,
    durationDays: z.number().int(),
    createdAt: z.string(),
    expiresAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;
