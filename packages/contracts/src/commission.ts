import { z } from "zod";

const idempotency = z.uuid({ version: "v4" });
export const commissionAmountBody = z.strictObject({
    requestId: idempotency,
    amountMinor: z.number().int().min(1).max(100_000_000),
});
export const commissionWithdrawalBody = commissionAmountBody.extend({
    method: z.string().trim().min(1).max(48),
    recipient: z.string().trim().min(1).max(600),
});
export const withdrawalReviewBody = z.strictObject({
    status: z.enum(["paid", "rejected"]),
    reason: z.string().trim().min(1).max(300),
});
export const withdrawalSchema = z.object({
    id: z.uuid(),
    amountMinor: z.number().int(),
    method: z.string(),
    status: z.enum(["pending", "paid", "rejected"]),
    reason: z.string().nullable(),
    createdAt: z.iso.datetime(),
});
export const adminWithdrawalSchema = withdrawalSchema.extend({
    email: z.string(),
});
export const recipientSchema = z.object({ recipient: z.string() });
export const commissionSchema = z.object({
    enabled: z.boolean(),
    withdrawEnabled: z.boolean(),
    withdrawMinMinor: z.number().int(),
    methods: z.array(z.string()),
    availableMinor: z.number().int(),
    entries: z.array(
        z.object({
            id: z.uuid(),
            kind: z.enum([
                "reward",
                "transfer",
                "withdrawal",
                "reversal",
                "clawback",
            ]),
            amountMinor: z.number().int(),
            createdAt: z.iso.datetime(),
        }),
    ),
    withdrawals: z.array(withdrawalSchema),
});
export type Commission = z.infer<typeof commissionSchema>;
export type AdminWithdrawal = z.infer<typeof adminWithdrawalSchema>;
export type CommissionAmount = z.infer<typeof commissionAmountBody>;
export type CommissionWithdrawal = z.infer<typeof commissionWithdrawalBody>;
export type WithdrawalReview = z.infer<typeof withdrawalReviewBody>;
