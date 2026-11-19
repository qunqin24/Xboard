import { z } from "zod";
import {
    bytesSchema,
    emailSchema,
    idSchema,
    INT4_MAX,
    pageQuerySchema,
    periodSchema,
} from "./common";
import { orderKindSchema, orderStatusSchema } from "./orders";
import { trafficResetModeSchema } from "./plans";
import { selectedUserIds } from "./operations";

const MAX_AMOUNT_MINOR = 100_000_000; // ¥1,000,000.00
const text = (max: number) => z.string().max(max);
const required = (label: string, max: number) =>
    z
        .string()
        .trim()
        .min(1, `请输入${label}`)
        .max(max, `${label}最多 ${max} 个字`);
const nullableInt = (min: number, max: number) =>
    z.number().int().min(min).max(max).nullable();

// ---------- Responses ----------

export const overviewSchema = z.object({
    users: z.number().int(),
    orders: z.number().int(),
    nodes: z.number().int(),
    openTickets: z.number().int(),
    revenueMinor: z.number().int(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const adminPlanSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    content: z.string().nullable(),
    transferEnable: bytesSchema,
    speedLimit: z.number().int().nullable(),
    deviceLimit: z.number().int().nullable(),
    published: z.boolean(),
    sort: z.number().int(),
    trafficResetMode: trafficResetModeSchema,
    trafficResetPriceMinor: z.number().int().positive().nullable(),
    prices: z.array(
        z.object({ period: periodSchema, amountMinor: z.number().int() }),
    ),
});
export type AdminPlan = z.infer<typeof adminPlanSchema>;

export const adminUserSchema = z.object({
    id: z.number().int(),
    email: z.string(),
    role: z.enum(["user", "admin"]),
    balance: z.number().int(),
    banned: z.boolean(),
    twoFactorEnabled: z.boolean(),
    transferEnable: bytesSchema,
    upload: bytesSchema,
    download: bytesSchema,
    planId: z.number().int().nullable(),
    /** Unix seconds; null means no expiry. */
    expiredAt: z.number().int().nullable(),
    verifiedAt: z.string().nullable(),
    speedLimit: z.number().int().nullable(),
    deviceLimit: z.number().int().nullable(),
    createdAt: z.string(),
    /** Unix seconds of the last sign-in. */
    lastLoginAt: z.number().int().nullable(),
    /** Email of the account whose invite code was used at sign-up. */
    invitedBy: z.string().nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminCreateUserBody = z.strictObject({
    email: emailSchema,
    verified: z.boolean().default(false),
});
export const adminCreatedUserSchema = z.object({
    id: idSchema,
    email: z.string(),
    password: z.string(),
});

export const adminNoticeSchema = z.object({
    id: z.number().int(),
    title: z.string(),
    content: z.string(),
    published: z.boolean(),
    createdAt: z.string(),
});
export type AdminNotice = z.infer<typeof adminNoticeSchema>;

export const adminOrderSchema = z.object({
    id: z.string(),
    userId: z.number().int(),
    planName: z.string(),
    kind: orderKindSchema,
    period: periodSchema.nullable(),
    status: orderStatusSchema,
    amountMinor: z.number().int(),
    creditMinor: z.number().int().nonnegative(),
    discountMinor: z.number().int().nonnegative(),
    payableMinor: z.number().int(),
    createdAt: z.string(),
    expiresAt: z.string(),
    paidAt: z.string().nullable(),
    user: z.object({ email: z.string() }),
});
export type AdminOrder = z.infer<typeof adminOrderSchema>;

export const adminLedgerSchema = z.object({
    id: z.string(),
    userId: z.number().int(),
    amountMinor: z.number().int(),
    reason: z.string().nullable(),
    orderId: z.string().nullable(),
    actorId: z.number().int().nullable(),
    createdAt: z.string(),
    user: z.object({ email: z.string() }),
});
export type AdminLedger = z.infer<typeof adminLedgerSchema>;

export const auditSchema = z.object({
    id: z.number().int(),
    actorId: z.number().int(),
    action: z.string(),
    target: z.string(),
    detail: z.unknown(),
    createdAt: z.string(),
    opsTokenId: z.uuid().optional(),
});
export type Audit = z.infer<typeof auditSchema>;

export const mailSchema = z.object({
    id: z.number().int(),
    to: z.string(),
    subject: z.string(),
    attempts: z.number().int(),
    sentAt: z.string().nullable(),
    nextAttempt: z.string(),
    lastError: z.string().nullable(),
    createdAt: z.string(),
});
export type Mail = z.infer<typeof mailSchema>;

export const statsSchema = z.object({
    days: z.array(
        z.object({
            date: z.string(),
            revenueMinor: z.number().int(),
            paidOrders: z.number().int(),
            newUsers: z.number().int(),
            trafficBytes: bytesSchema,
        }),
    ),
    topPlans: z.array(
        z.object({
            planName: z.string(),
            orders: z.number().int(),
            revenueMinor: z.number().int(),
        }),
    ),
});
export type Stats = z.infer<typeof statsSchema>;
export type StatsDay = Stats["days"][number];

// ---------- List queries (server-side paging) ----------

/** A filter given as a comma-separated list, e.g. `status=paid,pending`; empty means no filter. */
function csvEnum<T extends string>(values: readonly [T, ...T[]]) {
    return z
        .string()
        .optional()
        .transform((value) => (value ? value.split(",") : []))
        .pipe(z.array(z.enum(values)));
}

export const userListQuery = pageQuerySchema.extend({
    status: csvEnum(["active", "banned"]),
    role: csvEnum(["user", "admin"]),
    verified: csvEnum(["verified", "unverified"]),
    /** Plan ids, or "none" for users without a plan, e.g. `plan=3,none`. */
    plan: z
        .string()
        .optional()
        .transform((value) => (value ? value.split(",") : []))
        .pipe(
            z
                .array(
                    z.union([
                        z.literal("none"),
                        z
                            .string()
                            .regex(/^\d{1,10}$/)
                            .transform(Number),
                    ]),
                )
                .max(50),
        ),
});
export const orderListQuery = pageQuerySchema.extend({
    status: csvEnum(["pending", "paid", "cancelled"]),
});
export const ledgerListQuery = pageQuerySchema.extend({
    /** credit = manual top-ups, order = order payments. */
    kind: csvEnum(["credit", "order"]),
});
export const auditListQuery = pageQuerySchema.extend({
    /** Action names, e.g. `action=user.ban,balance.credit`. */
    action: z
        .string()
        .optional()
        .transform((value) => (value ? value.split(",") : []))
        .pipe(z.array(z.string().regex(/^[a-z_.]{1,50}$/)).max(50)),
    opsTokenId: z
        .string()
        .optional()
        .transform((value) => (value ? value.split(",") : []))
        .pipe(z.array(z.uuid()).max(50)),
});
const statsDays = z.coerce
    .number()
    .int()
    .min(1, "days 必须在 1 到 180 之间。")
    .max(180, "days 必须在 1 到 180 之间。");
export const statsQuery = z.object({
    days: statsDays.default(30),
    /** Range for topPlans when it differs from `days`, e.g. a 30-day view that also loads 30 days before it for comparison. */
    topDays: statsDays.optional(),
});
export type UserListQuery = z.infer<typeof userListQuery>;
export type OrderListQuery = z.infer<typeof orderListQuery>;

// ---------- Request bodies ----------

export const planBody = z.strictObject({
    name: required("名称", 80),
    content: text(4000),
    transferBytes: z.string().regex(/^[1-9]\d{0,14}$/, "流量需为正整数字节数"),
    speedLimit: nullableInt(1, 100_000).optional(),
    deviceLimit: nullableInt(1, 1000).optional(),
    published: z.boolean(),
    sort: z.number().int().min(0).max(INT4_MAX),
    trafficResetMode: trafficResetModeSchema.optional(),
    trafficResetPriceMinor: z
        .number()
        .int()
        .min(1)
        .max(MAX_AMOUNT_MINOR)
        .nullable()
        .optional(),
    prices: z
        .array(
            z.strictObject({
                period: periodSchema,
                amountMinor: z.number().int().min(1).max(MAX_AMOUNT_MINOR),
            }),
        )
        .max(periodSchema.options.length),
});
export type PlanBody = z.infer<typeof planBody>;

export const creditBody = z.strictObject({
    amountMinor: z.number().int().min(1).max(MAX_AMOUNT_MINOR),
    requestId: z.uuid({ version: "v4" }),
    reason: z
        .string()
        .trim()
        .min(3, "原因至少 3 个字")
        .max(200, "原因最多 200 个字"),
});
export const offlineOrderPaymentBody = creditBody
    .pick({ amountMinor: true })
    .extend({
        reason: z.string().trim().max(200, "备注最多 200 个字").optional(),
    });
export type OfflineOrderPaymentBody = z.infer<typeof offlineOrderPaymentBody>;
export const banBody = z.strictObject({ banned: z.boolean() });
export const resetTrafficBody = z.strictObject({
    reason: z
        .string()
        .trim()
        .min(3, "原因至少 3 个字")
        .max(200, "原因最多 200 个字"),
});
export const bulkResetTrafficBody = resetTrafficBody.extend({
    ids: selectedUserIds,
});
export const bulkResetTrafficResult = z.object({
    updated: z.number().int(),
    skipped: z.number().int(),
});
export type BulkResetTrafficResult = z.infer<typeof bulkResetTrafficResult>;
export const noticeBody = z.strictObject({
    title: required("标题", 120),
    content: required("内容", 10_000),
    published: z.boolean(),
});
/** Admin edit of a subscription. `expiredAt` is Unix seconds; at most 2100-01-01. */
const importedUsage = z
    .string()
    .regex(/^\d{1,19}$/, "用量需为非负整数字节数")
    .pipe(
        z
            .string()
            .refine(
                (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
                "用量超过上限",
            ),
    );
export const updateUserBody = z.strictObject({
    planId: idSchema.nullable(),
    expiredAt: z.number().int().min(0).max(4_102_444_800).nullable(),
    transferBytes: z
        .string()
        .regex(/^\d{1,15}$/, "流量需为不超过 15 位的整数字节数"),
    uploadBytes: importedUsage.optional(),
    downloadBytes: importedUsage.optional(),
    speedLimit: nullableInt(1, 100_000),
    deviceLimit: nullableInt(1, 1000),
});
export type UpdateUserBody = z.infer<typeof updateUserBody>;

export const bulkBanBody = z.strictObject({
    ids: selectedUserIds,
    banned: z.boolean(),
});
