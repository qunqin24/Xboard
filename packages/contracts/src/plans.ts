import { z } from "zod";
import { bytesSchema, periodSchema } from "./common";

export const priceSchema = z.object({
    period: periodSchema,
    amountMinor: z.number().int(),
});

export const trafficResetModeSchema = z.enum([
    "none",
    "activation_day",
    "month_start",
]);
export type TrafficResetMode = z.infer<typeof trafficResetModeSchema>;

/** A plan as shown to buyers. */
export const planSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    description: z.string(),
    transferBytes: bytesSchema,
    speedLimitMbps: z.number().int().nullable(),
    deviceLimit: z.number().int().nullable(),
    trafficResetMode: trafficResetModeSchema,
    trafficResetPriceMinor: z.number().int().positive().nullable(),
    prices: z.array(priceSchema),
});
export type Plan = z.infer<typeof planSchema>;
