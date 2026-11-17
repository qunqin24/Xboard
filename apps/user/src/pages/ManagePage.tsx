import { Check, Copy } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAccount } from "../api/hooks";
import { useCommand, usePanel } from "../api/panel";
import { queryClient } from "../query-client";
import { AppShell } from "../components/AppShell";
import { Card, Button, Notice, SectionLabel } from "../components/primitives";
import { Feedback, Field, Form, TextArea } from "../components/forms";
import { formatMinor, formatTraffic } from "../lib/format";

export interface Ticket {
    id: number;
    subject: string;
    closed: boolean;
    user: { email: string };
    messages: {
        id: number;
        isStaff: boolean;
        content: string;
        createdAt: string;
    }[];
}

export function Tickets({ staff = false }: { staff?: boolean }) {
    const data = usePanel<Ticket[]>("/tickets");
    const action = useCommand();

    const listContent = (
        <div className="space-y-4">
            {data.isPending ? (
                <p role="status" className="text-xs text-ink-muted">
                    正在加载工单…
                </p>
            ) : null}
            {data.isError ? (
                <Notice
                    tone="warn"
                    title="加载失败"
                    action={
                        <Button onClick={() => data.refetch()}>重试</Button>
                    }
                >
                    {data.error.message}
                </Notice>
            ) : null}
            {data.data?.length === 0 ? (
                <Notice title="暂无工单">有问题可以提交工单。</Notice>
            ) : null}
            {data.data?.map((ticket) => (
                <Card key={ticket.id} className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-4">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    aria-hidden
                                    className={`size-2 rounded-full ${
                                        ticket.closed
                                            ? "bg-ink-subtle"
                                            : "bg-signal"
                                    }`}
                                />
                                <h3 className="text-sm font-semibold text-ink">
                                    #{ticket.id} {ticket.subject}
                                </h3>
                                <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                                    {ticket.closed ? "已关闭" : "处理中"}
                                </span>
                            </div>
                            {staff ? (
                                <p className="mt-1 text-xs text-ink-muted">
                                    {ticket.user.email}
                                </p>
                            ) : null}
                        </div>
                        <Button
                            variant="secondary"
                            disabled={action.isPending}
                            onClick={() =>
                                action.mutate({
                                    path: `/tickets/${ticket.id}/status`,
                                    body: { closed: !ticket.closed },
                                })
                            }
                        >
                            {ticket.closed ? "重新打开" : "关闭工单"}
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {ticket.messages.map((message) => (
                            <div
                                key={message.id}
                                className={`rounded-lg border p-3.5 text-sm ${
                                    message.isStaff
                                        ? "border-accent/25 bg-accent-soft/40"
                                        : "border-line bg-surface-raised"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                                    <span className="font-medium text-ink">
                                        {message.isStaff ? "客服回复" : "用户"}
                                    </span>
                                    <span className="numeric">
                                        {new Date(
                                            message.createdAt,
                                        ).toLocaleString("zh-CN")}
                                    </span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">
                                    {message.content}
                                </p>
                            </div>
                        ))}
                    </div>

                    {!ticket.closed ? (
                        <div className="border-t border-line-subtle pt-4">
                            <Form
                                busy={action.isPending}
                                label="发送回复"
                                submit={(form) =>
                                    action.mutate({
                                        path: `/tickets/${ticket.id}/reply`,
                                        body: Object.fromEntries(form),
                                    })
                                }
                            >
                                <TextArea label="回复内容" name="content" />
                            </Form>
                        </div>
                    ) : null}
                </Card>
            ))}
            <Feedback error={action.error} success={action.isSuccess} />
        </div>
    );

    if (staff) {
        return listContent;
    }

    return (
        <section aria-labelledby="tickets-title" className="space-y-4">
            <h2
                id="tickets-title"
                className="text-base font-semibold tracking-tight text-ink"
            >
                Support Tickets · 工单支持
            </h2>
            <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
                <Card>
                    <h3 className="mb-4 text-sm font-semibold text-ink">
                        提交新工单
                    </h3>
                    <Form
                        busy={action.isPending}
                        label="提交工单"
                        submit={(form) =>
                            action.mutate({
                                path: "/tickets",
                                body: Object.fromEntries(form),
                            })
                        }
                    >
                        <Field
                            label="主题"
                            name="subject"
                            maxLength={120}
                            required
                        />
                        <TextArea label="问题描述" name="content" />
                    </Form>
                </Card>
                {listContent}
            </div>
        </section>
    );
}

export function ManagePage() {
    const account = useAccount();
    const navigate = useNavigate();
    const action = useCommand();
    const notices =
        usePanel<{ id: number; title: string; content: string }[]>("/notices");
    const ledger = usePanel<
        {
            id: string;
            amountMinor: number;
            createdAt: string;
            reason?: string;
            orderId?: string;
        }[]
    >("/account/ledger");
    const traffic = usePanel<
        {
            id: number;
            upload: string;
            download: string;
            createdAt: string;
            node: { name: string };
        }[]
    >("/account/traffic");
    const [links, setLinks] = useState<{
        mihomo: string;
        singbox: string;
    } | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copyLink = async (key: string, url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        } catch {
            /* Clipboard API may be unavailable; input remains selectable. */
        }
    };

    return (
        <AppShell email={account.data?.email}>
            <div className="space-y-8">
                <div className="border-b border-line pb-6">
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">
                        Services &amp; Account
                    </h1>
                    <p className="mt-1 text-xs text-ink-muted">
                        管理订阅链接、账户安全、余额流水、节点流量记录与工单支持
                    </p>
                </div>

                {/* Subscription Links Card */}
                <Card>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <SectionLabel>Subscription · 订阅链接</SectionLabel>
                            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-muted">
                                生成新链接会使旧链接立即失效。链接仅在生成后显示，请妥善保存。需有效套餐及可用节点。
                            </p>
                        </div>
                        <Button
                            busy={action.isPending}
                            onClick={() =>
                                action.mutate(
                                    { path: "/account/subscription" },
                                    {
                                        onSuccess: (result) =>
                                            setLinks(
                                                result as unknown as {
                                                    mihomo: string;
                                                    singbox: string;
                                                },
                                            ),
                                    },
                                )
                            }
                        >
                            生成／重置订阅链接
                        </Button>
                    </div>

                    {links ? (
                        <div className="mt-5 grid gap-4 border-t border-line-subtle pt-5 md:grid-cols-2">
                            {Object.entries(links).map(([label, url]) => (
                                <div
                                    key={label}
                                    className="rounded-lg border border-line bg-surface-raised p-3.5"
                                >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-ink">
                                            {label === "mihomo"
                                                ? "Mihomo / Clash Meta"
                                                : "Sing-box"}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => copyLink(label, url)}
                                            className="inline-flex cursor-pointer items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
                                        >
                                            {copiedKey === label ? (
                                                <>
                                                    <Check
                                                        aria-hidden
                                                        className="size-3.5 text-signal"
                                                    />
                                                    <span className="text-signal">
                                                        已复制
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy
                                                        aria-hidden
                                                        className="size-3.5"
                                                    />
                                                    <span>复制</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        readOnly
                                        value={url}
                                        aria-label={
                                            label === "mihomo"
                                                ? "Mihomo / Clash Meta 订阅地址"
                                                : "Sing-box 订阅地址"
                                        }
                                        onFocus={(event) =>
                                            event.target.select()
                                        }
                                        className="numeric w-full rounded border border-line bg-paper px-2.5 py-1.5 text-xs text-ink outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : null}
                </Card>

                {/* Security & Verification */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2">
                                <SectionLabel>邮箱验证</SectionLabel>
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                        account.data?.emailVerified
                                            ? "border-signal/30 bg-signal/10 text-signal"
                                            : "border-warn/30 bg-warn/10 text-warn"
                                    }`}
                                >
                                    <span
                                        className={`size-1.5 rounded-full ${
                                            account.data?.emailVerified
                                                ? "bg-signal"
                                                : "bg-warn"
                                        }`}
                                    />
                                    {account.data?.emailVerified
                                        ? "已验证"
                                        : "未验证"}
                                </span>
                            </div>
                            <p className="mt-3 text-sm font-medium text-ink">
                                {account.data?.email ?? "—"}
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">
                                验证邮箱可用于找回密码和接收账户安全通知。
                            </p>
                        </div>
                        <div className="mt-5">
                            <Button
                                variant="secondary"
                                disabled={account.data?.emailVerified}
                                busy={action.isPending}
                                onClick={() =>
                                    action.mutate({
                                        path: "/account/verify-email",
                                    })
                                }
                            >
                                {account.data?.emailVerified
                                    ? "已完成验证"
                                    : "发送验证邮件"}
                            </Button>
                        </div>
                    </Card>

                    <Card>
                        <SectionLabel>修改密码</SectionLabel>
                        <div className="mt-4">
                            <Form
                                busy={action.isPending}
                                label="修改并退出登录"
                                submit={(form) =>
                                    action.mutate(
                                        {
                                            path: "/account/password",
                                            body: Object.fromEntries(form),
                                        },
                                        {
                                            onSuccess: () => {
                                                queryClient.clear();
                                                void navigate({ to: "/login" });
                                            },
                                        },
                                    )
                                }
                            >
                                <Field
                                    label="原密码"
                                    name="oldPassword"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                />
                                <Field
                                    label="新密码（12 至 128 个字符）"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={12}
                                    maxLength={128}
                                    required
                                />
                            </Form>
                        </div>
                    </Card>
                </div>

                <Feedback error={action.error} success={action.isSuccess} />

                {/* Announcements */}
                <Card>
                    <SectionLabel>Notices · 系统公告</SectionLabel>
                    {notices.data && notices.data.length > 0 ? (
                        <div className="mt-4 divide-y divide-line-subtle">
                            {notices.data.map((item) => (
                                <article
                                    className="py-3.5 first:pt-0 last:pb-0"
                                    key={item.id}
                                >
                                    <h3 className="text-sm font-medium text-ink">
                                        {item.title}
                                    </h3>
                                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
                                        {item.content}
                                    </p>
                                </article>
                            ))}
                        </div>
                    ) : notices.data?.length === 0 ? (
                        <p className="mt-3 text-xs text-ink-muted">
                            暂无公告。
                        </p>
                    ) : null}
                    <Feedback error={notices.error} />
                </Card>

                {/* Ledger & Traffic Records */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <div className="flex items-center justify-between gap-2">
                            <SectionLabel>余额流水</SectionLabel>
                            <span className="text-xs text-ink-subtle">
                                最近 100 笔
                            </span>
                        </div>
                        {ledger.data && ledger.data.length > 0 ? (
                            <div className="mt-4 max-h-80 divide-y divide-line-subtle overflow-y-auto pr-1">
                                {ledger.data.map((item) => (
                                    <div
                                        className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                                        key={item.id}
                                    >
                                        <div>
                                            <p className="text-xs font-medium text-ink">
                                                {item.reason ?? "套餐支付"}
                                            </p>
                                            <p className="numeric mt-0.5 text-xs text-ink-muted">
                                                {new Date(
                                                    item.createdAt,
                                                ).toLocaleString("zh-CN")}
                                            </p>
                                        </div>
                                        <span
                                            className={`numeric text-sm font-semibold ${
                                                item.amountMinor >= 0
                                                    ? "text-signal"
                                                    : "text-ink"
                                            }`}
                                        >
                                            {item.amountMinor > 0 ? "+" : ""}
                                            {formatMinor(item.amountMinor)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : ledger.data?.length === 0 ? (
                            <p className="mt-3 text-xs text-ink-muted">
                                暂无流水。
                            </p>
                        ) : null}
                        <Feedback error={ledger.error} />
                    </Card>

                    <Card>
                        <div className="flex items-center justify-between gap-2">
                            <SectionLabel>流量记录</SectionLabel>
                            <span className="text-xs text-ink-subtle">
                                最近 100 笔
                            </span>
                        </div>
                        {traffic.data && traffic.data.length > 0 ? (
                            <div className="mt-4 max-h-80 divide-y divide-line-subtle overflow-y-auto pr-1">
                                {traffic.data.map((item) => (
                                    <div
                                        className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                                        key={item.id}
                                    >
                                        <div>
                                            <p className="text-xs font-medium text-ink">
                                                {item.node.name}
                                            </p>
                                            <p className="numeric mt-0.5 text-xs text-ink-muted">
                                                {new Date(
                                                    item.createdAt,
                                                ).toLocaleString("zh-CN")}
                                            </p>
                                        </div>
                                        <div className="numeric text-right text-xs">
                                            <p className="text-ink">
                                                ↑ {formatTraffic(item.upload)}
                                            </p>
                                            <p className="text-ink-muted">
                                                ↓ {formatTraffic(item.download)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : traffic.data?.length === 0 ? (
                            <p className="mt-3 text-xs text-ink-muted">
                                暂无节点上报。
                            </p>
                        ) : null}
                        <Feedback error={traffic.error} />
                    </Card>
                </div>

                <Tickets />
            </div>
        </AppShell>
    );
}

export function RecoverPage() {
    const [fragment] = useState(() => location.hash.slice(1));
    useEffect(() => {
        history.replaceState(null, "", location.pathname);
    }, []);
    const [purpose, token] = fragment.split(":");
    const [message, setMessage] = useState("");
    const action = useCommand();

    return (
        <div className="relative flex min-h-dvh flex-col overflow-hidden bg-paper text-ink">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--theme-line)_1px,transparent_1px)] [background-size:24px_24px] opacity-70"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,var(--theme-glow)_0%,transparent_70%)]"
            />

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
                </a>
                <a
                    href="/login"
                    className="rounded-md border border-line bg-surface-raised px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-subtle"
                >
                    返回登录
                </a>
            </header>

            <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-10">
                <div className="w-full max-w-[400px]">
                    <div className="mb-6 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight text-ink">
                            {purpose === "verify" ? "验证邮箱" : "找回密码"}
                        </h1>
                        <p className="mt-1.5 text-xs text-ink-muted">
                            {purpose === "verify"
                                ? "确认完成邮箱所有权验证"
                                : token
                                  ? "为你的账户设置新的登录密码"
                                  : "输入注册邮箱以接收一次性重置链接"}
                        </p>
                    </div>

                    <Card className="p-6 shadow-2xl">
                        {purpose === "verify" && token ? (
                            <Button
                                className="w-full py-2.5 text-sm"
                                busy={action.isPending}
                                onClick={() =>
                                    action.mutate(
                                        {
                                            path: "/auth/verify",
                                            body: { token },
                                        },
                                        {
                                            onSuccess: () =>
                                                setMessage(
                                                    "邮箱已验证，可以返回账户页面。",
                                                ),
                                        },
                                    )
                                }
                            >
                                确认验证邮箱
                            </Button>
                        ) : token ? (
                            <Form
                                busy={action.isPending}
                                label="重置密码"
                                submit={(form) =>
                                    action.mutate(
                                        {
                                            path: "/auth/reset",
                                            body: {
                                                token,
                                                password: form.get("password"),
                                            },
                                        },
                                        {
                                            onSuccess: () =>
                                                setMessage(
                                                    "密码已重置，请使用新密码登录。",
                                                ),
                                        },
                                    )
                                }
                            >
                                <Field
                                    label="新密码（12 至 128 个字符）"
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
                                                    "如果账户存在，邮件将发送到该邮箱。",
                                                ),
                                        },
                                    )
                                }
                            >
                                <Field
                                    label="账户邮箱"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                />
                            </Form>
                        )}

                        {message ? (
                            <p
                                role="status"
                                className="mt-4 rounded-lg border border-signal/35 bg-signal/10 px-3.5 py-2.5 text-xs text-signal"
                            >
                                {message}
                            </p>
                        ) : null}
                        <Feedback error={action.error} />
                    </Card>
                </div>
            </main>
        </div>
    );
}
