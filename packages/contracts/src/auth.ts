import { z } from "zod";
import { emailSchema, loginEmailSchema, tokenSchema } from "./common";
import { twoFactorCodeSchema } from "./security";

export const loginBody = z.strictObject({
    email: loginEmailSchema,
    password: z.string().min(1, "请输入密码").max(256, "密码最多 256 个字符"),
    twoFactorCode: twoFactorCodeSchema.optional(),
});
/** Invite codes: 8 characters from an alphabet without 0/O/1/I/L. */
export const inviteCodeSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,16}$/, "邀请码格式不正确");

export const emailCodeSchema = z
    .string()
    .trim()
    .regex(/^\d{6}$/, "验证码为 6 位数字");

export const registerBody = z.strictObject({
    email: emailSchema,
    password: z
        .string()
        .min(12, "密码至少 12 个字符")
        .max(128, "密码最多 128 个字符"),
    /** Required when the site requires email codes. */
    emailCode: emailCodeSchema.optional(),
    /** Required when the site is invite-only. */
    inviteCode: z.preprocess(
        (value) => (value === "" ? undefined : value),
        inviteCodeSchema.optional(),
    ),
    /** Must be true when the site lists terms or a privacy policy. */
    acceptTerms: z.boolean().optional(),
});
export const registerCodeBody = z.strictObject({ email: emailSchema });
export const registerCodeResult = z.object({
    /** Seconds before another code can be requested. */
    retryAfterSeconds: z.number().int(),
});
export const authResult = z.object({ email: z.string() });

export const forgotBody = z.strictObject({ email: emailSchema });
export const forgotResult = z.object({
    ok: z.literal(true),
    message: z.string(),
});
export const verifyBody = z.strictObject({ token: tokenSchema });
export const resetBody = z.strictObject({
    token: tokenSchema,
    password: z
        .string()
        .min(12, "密码至少 12 个字符")
        .max(128, "密码最多 128 个字符"),
});

export type LoginBody = z.infer<typeof loginBody>;
export type RegisterBody = z.input<typeof registerBody>;
export type RegisterCodeResult = z.infer<typeof registerCodeResult>;
export type AuthResult = z.infer<typeof authResult>;
