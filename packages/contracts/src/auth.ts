import { z } from "zod";
import { emailSchema, loginEmailSchema, tokenSchema } from "./common";

export const loginBody = z.strictObject({
    email: loginEmailSchema,
    password: z.string().min(1, "请输入密码").max(256, "密码最多 256 个字符"),
});
export const registerBody = z.strictObject({
    email: emailSchema,
    password: z
        .string()
        .min(12, "密码至少 12 个字符")
        .max(128, "密码最多 128 个字符"),
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
export type RegisterBody = z.infer<typeof registerBody>;
export type AuthResult = z.infer<typeof authResult>;
