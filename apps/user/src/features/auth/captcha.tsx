import { currentLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CaptchaSettings } from "@xboard/contracts";
import { toast } from "sonner";
import { request } from "@/api/client";
import { Button } from "@/components/ui/button";

type Provider = Exclude<CaptchaSettings["captchaProvider"], "off">;
type Action = "register" | "register_code" | "login" | "forgot";
type Widget = {
    render(
        container: HTMLElement,
        options: Record<string, unknown>,
    ): number | string;
    reset(id: number | string): void;
    remove?(id: number | string): void;
    ready?(callback: () => void): void;
};

const providers = {
    turnstile: {
        global: "turnstile",
        script: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    },
    recaptcha: {
        global: "grecaptcha",
        script: "https://www.google.com/recaptcha/api.js?render=explicit",
    },
    hcaptcha: {
        global: "hcaptcha",
        script: "https://js.hcaptcha.com/1/api.js?render=explicit",
    },
} as const;
const scripts = new Map<Provider, Promise<Widget>>();
function widget(provider: Provider): Promise<Widget> {
    const cached = scripts.get(provider);
    if (cached) return cached;
    const task = new Promise<Widget>((resolve, reject) => {
        const info = providers[provider];
        const script = document.createElement("script");
        const timeout = setTimeout(failed, 15_000);
        function failed() {
            clearTimeout(timeout);
            script.remove();
            scripts.delete(provider);
            reject(new Error("Captcha widget failed to load"));
        }
        const language = currentLocale() === "en-US" ? "en" : "zh-CN";
        script.src =
            provider === "turnstile"
                ? info.script
                : `${info.script}&hl=${language}`;
        script.async = true;
        script.onload = () => {
            const api = (
                window as Window & Partial<Record<typeof info.global, Widget>>
            )[info.global];
            if (!api) return failed();
            const loaded = () => {
                clearTimeout(timeout);
                resolve(api);
            };
            if (api.ready) api.ready(loaded);
            else loaded();
        };
        script.onerror = failed;
        document.head.append(script);
    });
    scripts.set(provider, task);
    return task;
}

export function useCaptcha(action: Action, enabled = true) {
    const settings = useQuery({
        queryKey: ["captcha-settings"],
        queryFn: () => request<CaptchaSettings>("/site/captcha"),
        enabled,
        staleTime: 10_000,
    });
    const provider = settings.data?.captchaProvider;
    const siteKey = settings.data?.captchaSiteKey;
    const required = Boolean(
        enabled &&
        provider &&
        provider !== "off" &&
        (action === "login"
            ? settings.data?.captchaOnLogin
            : action === "forgot"
              ? settings.data?.captchaOnPasswordReset
              : settings.data?.captchaOnRegister),
    );
    const container = useRef<HTMLDivElement>(null);
    const token = useRef<string | undefined>(undefined);
    const reset = useRef<() => void>(() => {});
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const element = container.current;
        if (
            !required ||
            !provider ||
            provider === "off" ||
            !siteKey ||
            !element
        )
            return;
        let active = true;
        let remove = () => {};
        const mount = document.createElement("div");
        element.append(mount);
        setFailed(false);
        widget(provider)
            .then((api) => {
                if (!active) return;
                const id = api.render(mount, {
                    sitekey: siteKey,
                    ...(window.innerWidth <= 400 && { size: "compact" }),
                    ...(provider === "turnstile" && {
                        action,
                        language: currentLocale() === "en-US" ? "en" : "zh-CN",
                    }),
                    callback: (value: string) => {
                        if (active) token.current = value;
                    },
                    "expired-callback": () => {
                        token.current = undefined;
                    },
                    "error-callback": () => {
                        token.current = undefined;
                        setFailed(true);
                    },
                });
                reset.current = () => api.reset(id);
                remove = () => {
                    if (api.remove) api.remove(id);
                    else api.reset(id);
                };
            })
            .catch(() => {
                if (active) setFailed(true);
            });
        return () => {
            active = false;
            token.current = undefined;
            reset.current = () => {};
            remove();
            mount.remove();
        };
    }, [action, provider, required, retry, siteKey]);

    const content = required ? (
        <div className="grid gap-field">
            <div ref={container} />
            {failed && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRetry((v) => v + 1)}
                >
                    重新加载人机验证
                </Button>
            )}
        </div>
    ) : null;
    function take(): false | { captchaToken?: string } {
        if (!required) return {};
        if (!token.current) {
            toast.error("请先完成人机验证。");
            return false;
        }
        const captchaToken = token.current;
        token.current = undefined;
        reset.current();
        return { captchaToken };
    }
    return { content, take };
}
