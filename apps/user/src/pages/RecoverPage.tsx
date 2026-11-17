import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCommand } from "../api/panel";
import { AuthLayout } from "../components/AuthLayout";
import { Feedback, Field, Form } from "../components/forms";
import { Button, buttonClass } from "../components/primitives";

export function RecoverPage() {
    // Tokens arrive in the URL fragment so they never reach server logs;
    // strip it from the address bar as soon as it has been read.
    const [fragment] = useState(() => location.hash.slice(1));
    useEffect(() => {
        history.replaceState(null, "", location.pathname);
    }, []);
    const [purpose, token] = fragment.split(":");
    const [message, setMessage] = useState("");
    const action = useCommand();
    const verifying = purpose === "verify";

    return (
        <AuthLayout
            title={verifying ? "验证邮箱" : token ? "设置新密码" : "找回密码"}
            description={
                verifying
                    ? "确认这是你的邮箱，完成验证。"
                    : token
                      ? "设置新密码后，所有设备上的登录都会失效。"
                      : "输入注册邮箱，我们会发送一次性重置链接，30 分钟内有效。"
            }
            headerAction={
                <Link
                    to="/login"
                    className={buttonClass({ variant: "quiet", size: "sm" })}
                >
                    返回登录
                </Link>
            }
        >
            {message ? (
                <div className="space-y-4">
                    <p
                        role="status"
                        className="rounded-md border border-signal/25 bg-signal-soft px-3.5 py-3 text-sm text-signal"
                    >
                        {message}
                    </p>
                    <Link to="/login" className={`${buttonClass()} w-full`}>
                        去登录
                    </Link>
                </div>
            ) : verifying && token ? (
                <Button
                    className="w-full"
                    busy={action.isPending}
                    onClick={() =>
                        action.mutate(
                            { path: "/auth/verify", body: { token } },
                            { onSuccess: () => setMessage("邮箱已验证。") },
                        )
                    }
                >
                    确认验证
                </Button>
            ) : token ? (
                <Form
                    busy={action.isPending}
                    label="重置密码"
                    submit={(form) =>
                        action.mutate(
                            {
                                path: "/auth/reset",
                                body: { token, password: form.get("password") },
                            },
                            {
                                onSuccess: () =>
                                    setMessage("密码已重置，请用新密码登录。"),
                            },
                        )
                    }
                >
                    <Field
                        label="新密码"
                        hint="12 至 128 个字符"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                    />
                </Form>
            ) : (
                <Form
                    busy={action.isPending}
                    label="发送重置邮件"
                    submit={(form) =>
                        action.mutate(
                            {
                                path: "/auth/forgot",
                                body: Object.fromEntries(form),
                            },
                            {
                                onSuccess: () =>
                                    setMessage(
                                        "如果该邮箱已注册，重置邮件已经发出，请查收。",
                                    ),
                            },
                        )
                    }
                >
                    <Field
                        label="邮箱"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        required
                    />
                </Form>
            )}
            <Feedback error={action.error} />
        </AuthLayout>
    );
}
