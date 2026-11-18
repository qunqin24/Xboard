import { z } from "zod";

export const twoFactorCodeSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(
        /^(?:\d{6}|[A-F0-9]{16}|[A-F0-9]{4}(?:-[A-F0-9]{4}){3})$/,
        "请输入 6 位动态验证码或恢复码",
    );
const password = z.string().min(1, "请输入当前密码").max(256);
export const totpSetupBody = z.strictObject({ password });
export const totpSetupResult = z.object({
    secret: z.string(),
    /** `otpauth://totp/...` provisioning URI for the QR code. */
    uri: z.string().startsWith("otpauth://totp/"),
    expiresAt: z.iso.datetime(),
});
export type TotpSetup = z.infer<typeof totpSetupResult>;
export const totpEnableBody = z.strictObject({
    code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "请输入 6 位动态验证码"),
});
export const twoFactorProofBody = z.strictObject({
    password,
    code: twoFactorCodeSchema,
});
export const recoveryCodesSchema = z.object({ codes: z.array(z.string()) });
export type RecoveryCodes = z.infer<typeof recoveryCodesSchema>;

export const deviceSessionSchema = z.object({
    id: z.uuid(),
    current: z.boolean(),
    userAgent: z.string().nullable(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
});
export type DeviceSession = z.infer<typeof deviceSessionSchema>;
export const revokedSessionsSchema = z.object({
    revoked: z.number().int().nonnegative(),
});
