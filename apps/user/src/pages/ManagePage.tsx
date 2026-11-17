import { ArrowsClockwise, Check, Copy } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAccount } from "../api/hooks";
import { useCommand, usePanel } from "../api/panel";
import { AppShell } from "../components/AppShell";
import { useConfirm } from "../components/overlays";
import { Feedback, Field, Form, inputClass } from "../components/forms";
import {
    Badge,
    Button,
    Card,
    CardHeader,
    PageHeader,
    Skeleton,
} from "../components/primitives";
import { NewTicketCard, TicketList } from "../components/Tickets";
import { queryClient } from "../query-client";
import { formatDateTime, formatMinor, formatTraffic } from "../lib/format";

type Links = { mihomo: string; singbox: string };

const CLIENTS: { key: keyof Links; label: string; hint: string }[] = [
    {
        key: "mihomo",
        label: "Mihomo / Clash Meta",
        hint: "Clash Verge、FlClash、Stash 等",
    },
    {
        key: "singbox",
        label: "Sing-box",
        hint: "sing-box、SFA、SFI、Hiddify 等",
    },
];

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex gap-2">
            <input
                readOnly
                value={value}
                aria-label={`${label} 订阅地址`}
                onFocus={(e) => e.target.select()}
                className={`${inputClass} numeric text-xs`}
            />
            <Button
                variant="secondary"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(value);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    } catch {
                        /* Clipboard may be unavailable; the field stays selectable. */
                    }
                }}
            >
                {copied ? (
                    <Check aria-hidden className="size-4 text-signal" />
                ) : (
                    <Copy aria-hidden className="size-4" />
                )}
                {copied ? "已复制" : "复制"}
            </Button>
        </div>
    );
}

function SubscriptionCard({ hasPlan }: { hasPlan: boolean }) {
    const action = useCommand();
    const confirm = useConfirm();
    const [links, setLinks] = useState<Links | null>(null);

    return (
        <Card>
            <CardHeader
                title="订阅链接"
                description="导入客户端即可使用。重新生成会让旧链接立即失效，但已导入的节点凭据不变。链接只显示一次，请妥善保存。"
                actions={
                    <Button
                        variant={links ? "secondary" : "primary"}
                        busy={action.isPending}
                        disabled={!hasPlan}
                        onClick={async () => {
                            // Generating always revokes the previous link, including
                            // one imported into a client before this visit.
                            if (
                                !(await confirm({
                                    title: links
                                        ? "重新生成订阅链接？"
                                        : "生成新的订阅链接？",
                                    description:
                                        "之前的订阅链接会立即失效，客户端需要改用新链接才能更新节点。已导入的节点凭据不变，暂时仍可连接。",
                                    confirmLabel: "生成",
                                }))
                            )
                                return;
                            action.mutate(
                                { path: "/account/subscription" },
                                {
                                    onSuccess: (result) =>
                                        setLinks(result as unknown as Links),
                                },
                            );
                        }}
                    >
                        <ArrowsClockwise aria-hidden className="size-4" />
                        {links ? "重新生成" : "生成订阅链接"}
                    </Button>
                }
            />
            {!hasPlan ? (
                <p className="mt-4 text-xs text-ink-muted">
                    开通套餐后才能生成订阅链接。
                </p>
            ) : null}
            {links ? (
                <div className="mt-5 space-y-4 border-t border-line-subtle pt-5">
                    {CLIENTS.map((client) => (
                        <div key={client.key}>
                            <p className="mb-1.5 flex items-baseline gap-2 text-xs">
                                <span className="font-medium text-ink">
                                    {client.label}
                                </span>
                                <span className="text-ink-subtle">
                                    {client.hint}
                                </span>
                            </p>
                            <CopyField
                                label={client.label}
                                value={links[client.key]}
                            />
                        </div>
                    ))}
                </div>
            ) : null}
            <Feedback error={action.error} />
        </Card>
    );
}

function SecurityCards() {
    const account = useAccount();
    const navigate = useNavigate();
    const verify = useCommand();
    const password = useCommand();
    const verified = account.data?.emailVerified;

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader
                    title="邮箱"
                    description="验证后可以用邮箱找回密码。"
                    actions={
                        <Badge dot tone={verified ? "success" : "warn"}>
                            {verified ? "已验证" : "未验证"}
                        </Badge>
                    }
                />
                <p className="mt-4 text-sm text-ink">
                    {account.data?.email ?? "—"}
                </p>
                {!verified ? (
                    <div className="mt-4">
                        <Button
                            variant="secondary"
                            busy={verify.isPending}
                            onClick={() =>
                                verify.mutate({ path: "/account/verify-email" })
                            }
                        >
                            发送验证邮件
                        </Button>
                    </div>
                ) : null}
                <Feedback
                    error={verify.error}
                    success={verify.isSuccess}
                    successText="验证邮件已发送，链接 30 分钟内有效。"
                />
            </Card>

            <Card>
                <CardHeader
                    title="修改密码"
                    description="修改后会退出所有设备上的登录。"
                />
                <div className="mt-4">
                    <Form
                        busy={password.isPending}
                        label="修改密码"
                        variant="secondary"
                        submit={(form) =>
                            password.mutate(
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
                            label="当前密码"
                            name="oldPassword"
                            type="password"
                            autoComplete="current-password"
                            required
                        />
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
                    <Feedback error={password.error} />
                </div>
            </Card>
        </div>
    );
}

function HistoryList<T>({
    title,
    query,
    empty,
    render,
}: {
    title: string;
    query: { data?: T[]; isPending: boolean; error: Error | null };
    empty: string;
    render: (item: T) => ReactNode;
}) {
    return (
        <Card padded={false}>
            <CardHeader
                className="px-5 pt-5 pb-3"
                title={title}
                actions={
                    <span className="text-xs text-ink-subtle">最近 100 条</span>
                }
            />
            {query.isPending ? (
                <div className="px-5 pb-5">
                    <Skeleton className="h-24" />
                </div>
            ) : query.data?.length ? (
                <ul className="max-h-80 divide-y divide-line-subtle overflow-y-auto border-t border-line-subtle">
                    {query.data.map(render)}
                </ul>
            ) : (
                <p className="border-t border-line-subtle px-5 py-8 text-center text-xs text-ink-muted">
                    {empty}
                </p>
            )}
            {query.error ? (
                <div className="px-5 pb-5">
                    <Feedback error={query.error} />
                </div>
            ) : null}
        </Card>
    );
}

export function ManagePage() {
    const account = useAccount();
    const notices =
        usePanel<{ id: number; title: string; content: string }[]>("/notices");
    const ledger = usePanel<
        {
            id: string;
            amountMinor: number;
            createdAt: string;
            reason?: string | null;
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

    return (
        <AppShell>
            <div className="space-y-10">
                <PageHeader
                    title="账户与服务"
                    description="订阅链接、账户安全、使用记录和工单。"
                />

                {notices.data?.length ? (
                    <section aria-label="系统公告" className="space-y-3">
                        {notices.data.map((notice) => (
                            <div
                                key={notice.id}
                                className="rounded-lg border border-accent/20 bg-accent-soft px-5 py-4"
                            >
                                <p className="text-sm font-medium text-ink">
                                    {notice.title}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
                                    {notice.content}
                                </p>
                            </div>
                        ))}
                    </section>
                ) : null}

                <SubscriptionCard hasPlan={Boolean(account.data?.plan)} />

                <SecurityCards />

                <div className="grid gap-4 md:grid-cols-2">
                    <HistoryList
                        title="余额流水"
                        query={ledger}
                        empty="还没有余额变动。"
                        render={(item) => (
                            <li
                                key={item.id}
                                className="flex items-center justify-between gap-4 px-5 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-ink">
                                        {item.reason ?? "套餐支付"}
                                    </p>
                                    <p className="numeric text-xs text-ink-subtle">
                                        {formatDateTime(item.createdAt)}
                                    </p>
                                </div>
                                <span
                                    className={`numeric text-sm ${item.amountMinor > 0 ? "text-signal" : "text-ink"}`}
                                >
                                    {item.amountMinor > 0 ? "+" : ""}
                                    {formatMinor(item.amountMinor)}
                                </span>
                            </li>
                        )}
                    />
                    <HistoryList
                        title="流量记录"
                        query={traffic}
                        empty="节点上报后会显示在这里。"
                        render={(item) => (
                            <li
                                key={item.id}
                                className="flex items-center justify-between gap-4 px-5 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-ink">
                                        {item.node.name}
                                    </p>
                                    <p className="numeric text-xs text-ink-subtle">
                                        {formatDateTime(item.createdAt)}
                                    </p>
                                </div>
                                <p className="numeric text-right text-xs text-ink-muted">
                                    ↑ {formatTraffic(item.upload)}
                                    <span className="mx-1.5 text-line-strong">
                                        |
                                    </span>
                                    ↓ {formatTraffic(item.download)}
                                </p>
                            </li>
                        )}
                    />
                </div>

                <section aria-labelledby="tickets-title" className="space-y-4">
                    <h2
                        id="tickets-title"
                        className="text-base font-semibold tracking-tight text-ink"
                    >
                        工单
                    </h2>
                    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
                        <NewTicketCard />
                        <TicketList />
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
