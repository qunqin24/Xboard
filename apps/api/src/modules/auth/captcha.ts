import { z } from "zod";
import { getConfig } from "../../config";
import { HttpError } from "../../http/errors";
import { getSettingSecret, readOperationalGroup } from "../system/settings";

export const captchaVerifiers = {
    turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    recaptcha: "https://www.google.com/recaptcha/api/siteverify",
    hcaptcha: "https://api.hcaptcha.com/siteverify",
} as const;

const proofResult = z.object({
    success: z.boolean(),
    hostname: z.string().optional(),
    action: z.string().optional(),
});

type Action = "register" | "register_code" | "login" | "forgot";

export async function requireCaptcha(
    action: Action,
    token?: string,
    ip?: string,
) {
    const settings = await readOperationalGroup("captcha");
    const { captchaProvider: provider } = settings;
    const required =
        action === "login"
            ? settings.captchaOnLogin
            : action === "forgot"
              ? settings.captchaOnPasswordReset
              : settings.captchaOnRegister;
    if (provider === "off" || !required) return;
    if (!token)
        throw new HttpError(400, "请先完成人机验证。", "captcha_required");
    const secret = await getSettingSecret("captchaSecretKey");
    if (!secret) throw new HttpError(503, "人机验证暂不可用。");
    const data = new URLSearchParams({ secret, response: token });
    if (ip) data.set("remoteip", ip);
    if (provider === "hcaptcha") data.set("sitekey", settings.captchaSiteKey);
    let result: z.infer<typeof proofResult>;
    try {
        const response = await fetch(captchaVerifiers[provider], {
            method: "POST",
            body: data,
            signal: AbortSignal.timeout(5_000),
            redirect: "error",
        });
        if (!response.ok) throw new Error("Verification unavailable");
        result = proofResult.parse(await response.json());
    } catch {
        throw new HttpError(503, "人机验证暂不可用。");
    }
    if (
        !result.success ||
        result.hostname !== new URL(getConfig().origin).hostname ||
        (provider === "turnstile" && result.action !== action)
    )
        throw new HttpError(400, "人机验证失败，请重试。", "captcha_invalid");
}
