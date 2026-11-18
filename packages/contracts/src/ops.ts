import { z } from "zod";

export const OPS_API_PREFIX = "/api/ops/v1";
export const OPS_SCOPES = ["*", "admin:read", "admin:write"] as const;

export const opsTokenBody = z.object({
    name: z.string().trim().min(1, "请输入令牌名称").max(80),
    expiresAt: z.iso.datetime({ offset: true }),
    allowedIps: z
        .array(z.union([z.ipv4(), z.ipv6()]))
        .max(32)
        .default([]),
    scopes: z.array(z.enum(OPS_SCOPES)).min(1).max(3).default(["*"]),
});
export type OpsTokenInput = z.input<typeof opsTokenBody>;

export const opsTokenSchema = z.object({
    id: z.uuid(),
    name: z.string(),
    scopes: z.array(z.enum(OPS_SCOPES)),
    allowedIps: z.array(z.string()),
    createdById: z.number().int(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
});
export type OpsTokenInfo = z.infer<typeof opsTokenSchema>;

export const createdOpsTokenSchema = opsTokenSchema.extend({
    token: z.string(),
});
export type CreatedOpsToken = z.infer<typeof createdOpsTokenSchema>;

export const opsIdempotencyKey = z.uuid("Idempotency-Key 必须是 UUID。");
