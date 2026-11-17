import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, useRegister } from "../api/hooks";
import { ApiError } from "@xboard/api-client";
import { AuthLayout } from "../components/AuthLayout";
import { inputClass } from "../components/forms";
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

    const fieldClass = (invalid: boolean) =>
        `${inputClass} h-10 ${invalid ? "border-danger focus:border-danger focus:ring-danger/15" : ""}`;

    return (
        <AuthLayout
            title={mode === "login" ? "登录" : "创建账户"}
            description={
                mode === "login"
                    ? "查看流量、续费套餐、获取订阅链接。"
                    : "用邮箱注册，密码需要 12 至 128 个字符。"
            }
            headerAction={
                <span className="text-xs text-ink-muted">
                    {mode === "login" ? "还没有账户？" : "已有账户？"}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            switchMode(mode === "login" ? "register" : "login")
                        }
                        className="ml-1 cursor-pointer font-medium text-ink underline-offset-4 hover:underline"
                    >
                        {mode === "login" ? "注册" : "登录"}
                    </button>
                </span>
            }
        >
            <form noValidate onSubmit={submit} className="space-y-4">
                <div>
                    <label
                        htmlFor="email"
                        className="mb-1.5 block text-xs font-medium text-ink"
                    >
                        邮箱
                    </label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="username"
                        inputMode="email"
                        placeholder="name@example.com"
                        aria-invalid={formState.errors.email ? true : undefined}
                        aria-describedby={
                            formState.errors.email ? "email-error" : undefined
                        }
                        className={fieldClass(Boolean(formState.errors.email))}
                        {...register("email")}
                    />
                    {formState.errors.email ? (
                        <p
                            id="email-error"
                            className="mt-1.5 text-xs text-danger"
                        >
                            {formState.errors.email.message}
                        </p>
                    ) : null}
                </div>

                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label
                            htmlFor="password"
                            className="text-xs font-medium text-ink"
                        >
                            密码
                        </label>
                        {mode === "login" ? (
                            <Link
                                to="/recover"
                                className="text-xs text-ink-muted transition-colors hover:text-ink"
                            >
                                忘记密码？
                            </Link>
                        ) : null}
                    </div>
                    <div className="relative">
                        <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete={
                                mode === "register"
                                    ? "new-password"
                                    : "current-password"
                            }
                            placeholder={
                                mode === "register" ? "至少 12 个字符" : ""
                            }
                            aria-invalid={
                                formState.errors.password ? true : undefined
                            }
                            aria-describedby={
                                formState.errors.password
                                    ? "password-error"
                                    : undefined
                            }
                            className={`${fieldClass(Boolean(formState.errors.password))} pr-10`}
                            {...register("password")}
                        />
                        <button
                            type="button"
                            aria-label={showPassword ? "隐藏密码" : "显示密码"}
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-ink-subtle transition-colors hover:text-ink"
                        >
                            {showPassword ? (
                                <EyeSlash aria-hidden className="size-4" />
                            ) : (
                                <Eye aria-hidden className="size-4" />
                            )}
                        </button>
                    </div>
                    {formState.errors.password ? (
                        <p
                            id="password-error"
                            className="mt-1.5 text-xs text-danger"
                        >
                            {formState.errors.password.message}
                        </p>
                    ) : null}
                </div>

                {formError ? (
                    <p
                        role="alert"
                        className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger"
                    >
                        {formError}
                    </p>
                ) : null}
                {registered ? (
                    <p
                        role="status"
                        className="rounded-md border border-signal/25 bg-signal-soft px-3 py-2 text-xs text-signal"
                    >
                        账户已创建，请用刚才的邮箱和密码登录。
                    </p>
                ) : null}

                <Button type="submit" busy={busy} className="h-10 w-full">
                    {mode === "login" ? "登录" : "创建账户"}
                </Button>
            </form>
        </AuthLayout>
    );
}
