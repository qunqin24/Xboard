import { z } from "zod";

/** Postgres `int4` upper bound; ids and counters above it would 500 in the database. */
export const INT4_MAX = 2_147_483_647;

/** A positive int4 id in a JSON body. */
export const idSchema = z.number().int().min(1).max(INT4_MAX);

/** The same id from a URL path or query string, e.g. "/plans/12". */
export const idParam = z
    .string()
    .regex(/^\d{1,10}$/, "编号格式不正确")
    .transform(Number)
    .pipe(
        z
            .number()
            .int()
            .min(1, "编号格式不正确")
            .max(INT4_MAX, "编号格式不正确"),
    );

export const uuidParam = z.uuid("编号格式不正确");

/** Byte counts travel as decimal strings so BigInt precision survives JSON. */
export const bytesSchema = z.string().regex(/^\d+$/, "流量需为非负整数字节数");

export const periodSchema = z.enum(["monthly", "quarterly", "yearly"]);
export type Period = z.infer<typeof periodSchema>;

export const okSchema = z.object({ ok: z.literal(true) });

/** Trim, NFC and lowercase: one canonical spelling per mailbox. */
export function normalizeEmail(value: string): string {
    return value.trim().normalize("NFC").toLowerCase();
}

/** A new mailbox (register, forgot password): checked format, normalised. */
export const emailSchema = z
    .string()
    .transform(normalizeEmail)
    .pipe(
        z
            .string()
            .min(1, "请输入邮箱")
            .max(64, "邮箱最多 64 个字符")
            .pipe(z.email("邮箱格式不正确")),
    );

/**
 * Login only needs a lookup key; a malformed address simply matches no user,
 * so sign-in does not reject mailboxes that newer format rules would.
 */
export const loginEmailSchema = z
    .string()
    .transform(normalizeEmail)
    .pipe(z.string().min(1, "请输入邮箱").max(64, "邮箱最多 64 个字符"));

/** One-time tokens: 32 random bytes, base64url. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "链接无效");

/** Server-side paging and keyword search for long admin lists. */
export const pageQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pagedSchema<T extends z.ZodType>(item: T) {
    return z.object({
        items: z.array(item),
        total: z.number().int(),
        page: z.number().int(),
        pageSize: z.number().int(),
    });
}
export type Paged<T> = {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
};

/** Every error body the API sends. */
export const errorSchema = z.object({
    error: z.object({
        status: z.number().int(),
        message: z.string(),
        code: z.string().optional(),
    }),
});
