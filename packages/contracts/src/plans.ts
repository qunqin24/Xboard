import { z } from "zod";
import { bytesSchema, periodSchema } from "./common";

export const priceSchema = z.object({
    period: periodSchema,
    amountMinor: z.number().int(),
});

/** A plan as shown to buyers. */
export const planSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    description: z.string(),
    transferBytes: bytesSchema,
    speedLimitMbps: z.number().int().nullable(),
    deviceLimit: z.number().int().nullable(),
    prices: z.array(priceSchema),
});
export type Plan = z.infer<typeof planSchema>;
