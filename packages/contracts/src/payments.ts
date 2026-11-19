import { z } from "zod";
import { idSchema } from "./common";

const https = z.url({ protocol: /^https$/ }).max(512);
const field = z.string().trim().min(1).max(1024);
export const paymentKind = z.enum(["epay", "stripe"]);
export const paymentGatewaySchema = z.object({
    id: idSchema,
    name: z.string(),
    kind: paymentKind,
    icon: https.nullable(),
    feePercentBasisPoints: z.number().int().min(0).max(10_000),
    feeFixedMinor: z.number().int().min(0).max(100_000_000),
});
const gatewayCommon = paymentGatewaySchema
    .omit({ id: true, kind: true })
    .extend({
        name: z.string().trim().min(1).max(80),
        enabled: z.boolean(),
        sortOrder: z.number().int().min(0).max(1_000_000),
    });
const epayConfig = z.strictObject({
    apiUrl: https,
    pid: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    payType: z.enum(["", "alipay", "wxpay"]).default(""),
});
const empty = z.strictObject({});
export const gatewayBody = z.discriminatedUnion("kind", [
    gatewayCommon.strict().extend({
        kind: z.literal("epay"),
        config: epayConfig,
        secrets: z.strictObject({ key: field }).optional(),
    }),
    gatewayCommon.strict().extend({
        kind: z.literal("stripe"),
        config: empty,
        secrets: z
            .strictObject({
                secretKey: field.regex(/^sk_(?:live|test)_/),
                webhookSecret: field.regex(/^whsec_/),
            })
            .optional(),
    }),
]);
export const adminGatewaySchema = gatewayCommon.extend({
    id: idSchema,
    kind: paymentKind,
    config: z.union([epayConfig, empty]),
    configured: z.boolean(),
});
export const checkoutBody = z.strictObject({
    gatewayId: idSchema,
    requestId: z.uuid({ version: "v4" }),
});
export const checkoutSchema = z.object({
    url: https,
    amountMinor: z.number().int().positive(),
    feeMinor: z.number().int().nonnegative(),
});
export const paymentReceiptSchema = z.object({
    id: z.uuid(),
    orderId: z.uuid(),
    gatewayId: idSchema,
    amountMinor: z.number().int(),
    feeMinor: z.number().int(),
    status: z.enum(["pending", "settled", "credited", "review", "refunded"]),
    externalId: z.string().nullable(),
    receivedAt: z.string().nullable(),
});
/** Settle a receipt held for review: credit it now, or record an offline refund. */
export const receiptResolutionBody = z.strictObject({
    action: z.enum(["credit", "refunded"]),
    note: z.string().trim().min(1, "请填写处理说明").max(200),
});
export type ReceiptResolution = z.infer<typeof receiptResolutionBody>;
export type PaymentGateway = z.infer<typeof paymentGatewaySchema>;
export type AdminGateway = z.infer<typeof adminGatewaySchema>;
export type Checkout = z.infer<typeof checkoutSchema>;
export type PaymentReceipt = z.infer<typeof paymentReceiptSchema>;
export type GatewayBody = z.infer<typeof gatewayBody>;
export type CheckoutBody = z.infer<typeof checkoutBody>;
