import { Eye, EyeSlash, ShieldCheck } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, useRegister } from "../api/hooks";
import { ApiError } from "@xboard/api-client";
import { Button } from "../components/primitives";

const schema = z.object({
    email: z
        .string()
        .trim()
        .min(1, "请输入邮箱")
        .max(64, "邮箱最多 64 个字符")
        .email("邮箱格式不正确"),
    password: z.string().min(1, "请输入密码").max(256, "密码最多 256 个字符"),
});

type Values = z.infer<typeof schema>;

export function LoginPage() {
    const navigate = useNavigate();
    const login = useLogin();
    const registration = useRegister();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [showPassword, setShowPassword] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const { register, handleSubmit, formState } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { email: "", password: "" },
    });

    const busy = login.isPending || registration.isPending;

    const switchMode = (next: "login" | "register") => {
        setMode(next);
        setFormError(null);
        setRegistered(false);
    };

    const submit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            if (mode === "register") {
                if (
                    values.password.length < 12 ||
                    values.password.length > 128
                ) {
                    setFormError("注册密码须为 12 至 128 个字符。");
                    return;
                }
                await registration.mutateAsync(values);
                setRegistered(true);
                setMode("login");
                return;
            }
            await login.mutateAsync(values);
            await navigate({ to: "/" });
        } catch (error) {
            setFormError(
                error instanceof ApiError
                    ? error.status === 429
                        ? "尝试次数过多，请稍后再试。"
                        : error.status === 401 && mode === "login"
                          ? "邮箱或密码不正确，请检查后重试。"
                          : error.message
                    : "无法完成请求，请检查网络连接和服务是否正常后重试。",
            );
        }
    });

    return (
        <div className="relative flex min-h-dvh flex-col overflow-hidden bg-paper text-ink">
            {/* Subtle Vercel-style dot matrix & top radial glow */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--theme-line)_1px,transparent_1px)] [background-size:24px_24px] opacity-70"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,var(--theme-glow)_0%,transparent_70%)]"
            />

            {/* Minimal Top Header */}
            <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
                <a
                    href="/login"
                    className="flex items-center gap-2.5 text-ink transition-opacity hover:opacity-85"
                >
                    <span
                        aria-hidden
                        className="grid size-7 place-items-center rounded-md bg-ink text-paper"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="size-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                        >
                            <path d="m6 6 12 12M18 6 6 18" />
                        </svg>
                    </span>
                    <span className="text-sm font-semibold tracking-tight">
                        Xboard
                    </span>
                    {import.meta.env.DEV ? (
                        <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                            DEV
                        </span>
                    ) : null}
                </a>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                        switchMode(mode === "login" ? "register" : "login")
                    }
                    className="rounded-md border border-line bg-surface-raised px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-subtle"
                >
                    {mode === "login" ? "注册账户" : "返回登录"}
                </button>
            </header>

            {/* Centered Auth Stage */}
            <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-10">
                <div className="w-full max-w-[400px]">
                    <div className="mb-7 text-center">
                        <div
                            aria-hidden
                            className="mx-auto mb-5 grid size-11 place-items-center rounded-xl border border-line bg-surface shadow-sm"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                className="size-5 text-ink"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2.2}
                                strokeLinecap="round"
                            >
                                <path d="m6 6 12 12M18 6 6 18" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight text-ink">
                            {mode === "login"
                                ? "登录到 Xboard"
                                : "创建 Xboard 账户"}
                        </h1>
                        <p className="mt-1.5 text-xs text-ink-muted">
                            {mode === "login"
                                ? "管理你的订阅流量、套餐与客户端配置"
                                : "使用邮箱注册新账户，密码需 12 至 128 个字符"}
                        </p>
                    </div>

                    <form
                        noValidate
                        onSubmit={submit}
                        aria-labelledby="auth-mode-label"
                        className="rounded-2xl border border-line bg-surface/95 p-6 shadow-2xl backdrop-blur-sm"
                    >
                        {/* Segmented Mode Switcher */}
                        <div
                            id="auth-mode-label"
                            role="tablist"
                            aria-label="认证方式"
                            className="mb-6 grid grid-cols-2 rounded-lg border border-line bg-paper p-1"
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === "login"}
                                disabled={busy}
                                onClick={() => switchMode("login")}
                                className={`cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors ${
                                    mode === "login"
                                        ? "bg-surface-active text-ink"
                                        : "text-ink-muted hover:text-ink"
                                }`}
                            >
                                登录
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === "register"}
                                disabled={busy}
                                onClick={() => switchMode("register")}
                                className={`cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors ${
                                    mode === "register"
                                        ? "bg-surface-active text-ink"
                                        : "text-ink-muted hover:text-ink"
                                }`}
                            >
                                注册
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-xs font-medium text-ink"
                                >
                                    邮箱地址
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="username"
                                    inputMode="email"
                                    placeholder="name@example.com"
                                    aria-invalid={
                                        formState.errors.email
                                            ? true
                                            : undefined
                                    }
                                    aria-describedby={
                                        formState.errors.email
                                            ? "email-error"
                                            : undefined
                                    }
                                    className="mt-2 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-line-strong"
                                    {...register("email")}
                                />
                                {formState.errors.email ? (
                                    <p
                                        id="email-error"
                                        className="mt-1.5 text-xs text-warn"
                                    >
                                        {formState.errors.email.message}
                                    </p>
                                ) : null}
                            </div>

                            <div>
                                <div className="flex items-center justify-between">
                                    <label
                                        htmlFor="password"
                                        className="block text-xs font-medium text-ink"
                                    >
                                        密码
                                    </label>
                                    {mode === "login" ? (
                                        <a
                                            href="/recover"
                                            className="text-xs text-ink-muted transition-colors hover:text-ink"
                                        >
                                            忘记密码？
                                        </a>
                                    ) : null}
                                </div>
                                <div className="relative mt-2">
                                    <input
                                        id="password"
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        autoComplete={
                                            mode === "register"
                                                ? "new-password"
                                                : "current-password"
                                        }
                                        placeholder={
                                            mode === "register"
                                                ? "至少 12 位字符"
                                                : "••••••••••••"
                                        }
                                        aria-invalid={
                                            formState.errors.password
                                                ? true
                                                : undefined
                                        }
                                        aria-describedby={
                                            formState.errors.password
                                                ? "password-error"
                                                : undefined
                                        }
                                        className="w-full rounded-lg border border-line bg-paper py-2.5 pl-3.5 pr-10 text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors focus:border-line-strong"
                                        {...register("password")}
                                    />
                                    <button
                                        type="button"
                                        aria-label={
                                            showPassword
                                                ? "隐藏密码"
                                                : "显示密码"
                                        }
                                        onClick={() =>
                                            setShowPassword((prev) => !prev)
                                        }
                                        className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-ink-muted transition-colors hover:text-ink"
                                    >
                                        {showPassword ? (
                                            <EyeSlash
                                                aria-hidden
                                                className="size-4"
                                            />
                                        ) : (
                                            <Eye
                                                aria-hidden
                                                className="size-4"
                                            />
                                        )}
                                    </button>
                                </div>
                                {formState.errors.password ? (
                                    <p
                                        id="password-error"
                                        className="mt-1.5 text-xs text-warn"
                                    >
                                        {formState.errors.password.message}
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        {formError ? (
                            <div
                                role="alert"
                                className="mt-4 rounded-lg border border-warn/35 bg-warn/10 px-3.5 py-2.5 text-xs text-warn"
                            >
                                {formError}
                            </div>
                        ) : null}

                        {registered ? (
                            <div
                                role="status"
                                className="mt-4 rounded-lg border border-signal/35 bg-signal/10 px-3.5 py-2.5 text-xs text-signal"
                            >
                                账户已创建，请使用刚才的邮箱和密码登录。
                            </div>
                        ) : null}

                        <Button
                            type="submit"
                            busy={busy}
                            className="mt-6 w-full py-2.5 text-sm"
                        >
                            {mode === "login" ? "继续登录" : "创建账户"}
                        </Button>
                    </form>

                    <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-subtle">
                        <ShieldCheck aria-hidden className="size-3.5" />
                        <span>HttpOnly 安全会话 · 独立加盐加密</span>
                    </div>
                </div>
            </main>
        </div>
    );
}
