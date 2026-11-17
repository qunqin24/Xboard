import {
    Check,
    Copy,
    Key,
    Prohibit,
    UserCircle,
    Wallet,
} from "@phosphor-icons/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useCommand, usePanel } from "../api/panel";
import { Feedback, Field, Form, inputClass, Select } from "../components/forms";
import { Dialog, useToast } from "../components/overlays";
import { Badge, Button, PageHeader } from "../components/primitives";
import {
    formatDate,
    formatMinor,
    formatTraffic,
    sumBytes,
    usedPercent,
} from "../lib/format";
import { DataTable } from "./DataTable";
import {
    bytesToGiB,
    EditorPanel,
    giBToBytes,
    useAdminAction,
    WithEditor,
    yuanToMinor,
} from "./Editor";
import type { PlanRow, UserRow } from "./types";

const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
});

/** Unix seconds → YYYY-MM-DD in Asia/Shanghai, for <input type="date">. */
const toDateInput = (seconds: number | null) =>
    seconds === null ? "" : shanghaiDate.format(new Date(seconds * 1000));

/** YYYY-MM-DD → end of that day in Asia/Shanghai, as unix seconds. */
const fromDateInput = (value: string) =>
    value ? Math.floor(Date.parse(`${value}T23:59:59+08:00`) / 1000) : null;

const optional = (value: FormDataEntryValue | null) =>
    value ? Number(value) : null;

function UsageBar({ used, total }: { used: string; total: string }) {
    const percent = usedPercent(used, total);
    return (
        <div className="min-w-28">
            <p className="numeric text-xs text-ink-muted">
                {formatTraffic(used)} / {formatTraffic(total)}
            </p>
            <div className="mt-1 h-1 rounded-full bg-surface-active">
                <div
                    className={`h-1 rounded-full ${percent >= 90 ? "bg-warn" : "bg-ink"}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

function Section({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t border-line-subtle pt-5 first:border-t-0 first:pt-0">
            <h3 className="text-sm font-medium text-ink">{title}</h3>
            <p className="mt-1 mb-3 text-xs text-ink-muted">{description}</p>
            {children}
        </section>
    );
}

function SubscriptionForm({
    user,
    plans,
}: {
    user: UserRow;
    plans: PlanRow[];
}) {
    const save = useCommand();
    const toast = useToast();
    const [expiry, setExpiry] = useState(toDateInput(user.expiredAt));
    const extend = (days: number) => {
        const base = Math.max(
            Date.now() / 1000,
            fromDateInput(expiry) ?? Date.now() / 1000,
        );
        setExpiry(toDateInput(base + days * 86400));
    };

    return (
        <>
            <Form
                busy={save.isPending}
                label="保存订阅"
                variant="secondary"
                submit={(form) =>
                    save.mutate(
                        {
                            path: `/admin/users/${user.id}`,
                            method: "PUT",
                            body: {
                                planId: optional(form.get("planId")),
                                expiredAt: fromDateInput(expiry),
                                transferBytes: giBToBytes(
                                    form.get("transferGiB"),
                                ),
                                speedLimit: optional(form.get("speedLimit")),
                                deviceLimit: optional(form.get("deviceLimit")),
                            },
                        },
                        { onSuccess: () => toast.success("订阅已更新") },
                    )
                }
            >
                <div>
                    <label
                        htmlFor="user-plan"
                        className="mb-1.5 block text-xs font-medium text-ink"
                    >
                        套餐
                    </label>
                    <select
                        id="user-plan"
                        name="planId"
                        defaultValue={user.planId ?? ""}
                        className={inputClass}
                    >
                        <option value="">未开通</option>
                        {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name}
                                {plan.published ? "" : "（未发布）"}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <span className="mb-1.5 flex items-baseline justify-between gap-2">
                        <label
                            htmlFor="user-expiry"
                            className="text-xs font-medium text-ink"
                        >
                            到期日
                        </label>
                        <span className="text-xs text-ink-subtle">
                            留空为长期有效
                        </span>
                    </span>
                    <input
                        id="user-expiry"
                        type="date"
                        value={expiry}
                        onChange={(event) => setExpiry(event.target.value)}
                        className={`${inputClass} numeric`}
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {[30, 90, 365].map((days) => (
                            <Button
                                key={days}
                                size="sm"
                                variant="secondary"
                                onClick={() => extend(days)}
                            >
                                +{days} 天
                            </Button>
                        ))}
                        <Button
                            size="sm"
                            variant="quiet"
                            onClick={() => setExpiry("")}
                        >
                            长期
                        </Button>
                    </div>
                </div>
                <Field
                    label="流量额度"
                    hint="GB，按 1024 进制"
                    name="transferGiB"
                    type="number"
                    min={0}
                    max={900000}
                    step={0.01}
                    defaultValue={bytesToGiB(user.transferEnable)}
                    required
                />
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="限速"
                        hint="Mbps"
                        name="speedLimit"
                        type="number"
                        min={1}
                        max={100000}
                        placeholder="不限"
                        defaultValue={user.speedLimit ?? ""}
                    />
                    <Field
                        label="设备数"
                        name="deviceLimit"
                        type="number"
                        min={1}
                        max={1000}
                        placeholder="不限"
                        defaultValue={user.deviceLimit ?? ""}
                    />
                </div>
            </Form>
            <Feedback error={save.error} />
        </>
    );
}

function CreditForm({ user }: { user: UserRow }) {
    const credit = useCommand();
    const toast = useToast();
    const request = useRef<{ signature: string; id: string } | null>(null);
    const form = useRef<HTMLDivElement>(null);

    return (
        <div ref={form}>
            <Form
                busy={credit.isPending}
                label="确认入账"
                submit={(data) => {
                    const body = {
                        amountMinor: yuanToMinor(data.get("amount")),
                        reason: String(data.get("reason")),
                    };
                    // Retrying the same amount and reason reuses the request id,
                    // so a double submit can never credit twice.
                    const signature = JSON.stringify(body);
                    if (request.current?.signature !== signature)
                        request.current = {
                            signature,
                            id: crypto.randomUUID(),
                        };
                    credit.mutate(
                        {
                            path: `/admin/users/${user.id}/credit`,
                            body: { ...body, requestId: request.current.id },
                        },
                        {
                            onSuccess: () => {
                                request.current = null;
                                toast.success(
                                    `已入账 ${formatMinor(body.amountMinor)}`,
                                );
                                form.current?.querySelector("form")?.reset();
                            },
                        },
                    );
                }}
            >
                <Field
                    label="金额（元）"
                    type="number"
                    name="amount"
                    min={0.01}
                    max={1000000}
                    step={0.01}
                    required
                />
                <Field
                    label="凭证或原因"
                    name="reason"
                    placeholder="转账单号 2026111700123"
                    minLength={3}
                    maxLength={200}
                    required
                />
            </Form>
            <Feedback error={credit.error} />
        </div>
    );
}

function UserPanel({
    user,
    plans,
    onClose,
    onPasswordReset,
}: {
    user: UserRow;
    plans: PlanRow[];
    onClose: () => void;
    onPasswordReset: (user: UserRow) => void;
}) {
    const reset = useCommand();
    const toast = useToast();
    const action = useAdminAction();
    const used = sumBytes(user.upload, user.download);
    const plan = plans.find((p) => p.id === user.planId);

    return (
        <EditorPanel
            title={user.email}
            description={`用户 #${user.id}`}
            onClose={onClose}
        >
            <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-surface-raised p-3 text-xs">
                <div>
                    <dt className="text-ink-muted">余额</dt>
                    <dd className="numeric mt-0.5 text-sm text-ink">
                        {formatMinor(user.balance)}
                    </dd>
                </div>
                <div>
                    <dt className="text-ink-muted">套餐</dt>
                    <dd className="mt-0.5 text-sm text-ink">
                        {plan?.name ?? "未开通"}
                    </dd>
                </div>
                <div>
                    <dt className="text-ink-muted">已用流量</dt>
                    <dd className="numeric mt-0.5 text-sm text-ink">
                        {formatTraffic(used)} /{" "}
                        {formatTraffic(user.transferEnable)}
                    </dd>
                </div>
                <div>
                    <dt className="text-ink-muted">到期</dt>
                    <dd className="numeric mt-0.5 text-sm text-ink">
                        {user.planId ? formatDate(user.expiredAt) : "—"}
                    </dd>
                </div>
            </dl>

            <div className="space-y-5">
                <Section
                    title="编辑订阅"
                    description="直接修改套餐、到期日和额度，写入审计日志。不会扣款，也不会改动已用流量。"
                >
                    <SubscriptionForm
                        key={JSON.stringify(user)}
                        user={user}
                        plans={plans}
                    />
                </Section>

                <Section
                    title="手动入账"
                    description="写入余额流水和审计日志。同一金额和原因重复提交不会重复入账。"
                >
                    <CreditForm user={user} />
                </Section>

                <Section
                    title="清零已用流量"
                    description="上传和下载归零，额度和到期时间不变。"
                >
                    <Form
                        busy={reset.isPending}
                        label="清零流量"
                        variant="secondary"
                        submit={(form) =>
                            reset.mutate(
                                {
                                    path: `/admin/users/${user.id}/reset-traffic`,
                                    body: Object.fromEntries(form),
                                },
                                {
                                    onSuccess: () =>
                                        toast.success("流量已清零"),
                                },
                            )
                        }
                    >
                        <Field
                            label="原因"
                            name="reason"
                            minLength={3}
                            maxLength={200}
                            required
                        />
                    </Form>
                    <Feedback error={reset.error} />
                </Section>

                <Section
                    title="账户安全"
                    description={
                        user.role === "admin"
                            ? "管理员账户不能在这里重置密码或封禁。"
                            : "重置密码和封禁都会立即撤销该用户的全部登录。"
                    }
                >
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            disabled={user.role === "admin"}
                            onClick={() => onPasswordReset(user)}
                        >
                            <Key aria-hidden className="size-4" />
                            重置密码
                        </Button>
                        <Button
                            variant={user.banned ? "secondary" : "danger"}
                            disabled={user.role === "admin"}
                            busy={action.pending}
                            onClick={() => void toggleBan(action.run, user)}
                        >
                            <Prohibit aria-hidden className="size-4" />
                            {user.banned ? "解除封禁" : "封禁"}
                        </Button>
                    </div>
                </Section>
            </div>
        </EditorPanel>
    );
}

type Run = ReturnType<typeof useAdminAction>["run"];

const toggleBan = (run: Run, user: UserRow) =>
    run({
        path: `/admin/users/${user.id}/ban`,
        body: { banned: !user.banned },
        success: user.banned ? "已解除封禁" : "已封禁",
        confirm: user.banned
            ? undefined
            : {
                  title: `封禁 ${user.email}？`,
                  description:
                      "立即撤销该用户的全部登录，节点也不再下发该用户。可以随时解除。",
                  confirmLabel: "封禁",
                  tone: "danger",
              },
    });

function TemporaryPassword({
    value,
    onClose,
}: {
    value: { email: string; password: string } | null;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <Dialog
            open={value !== null}
            onClose={() => {
                setCopied(false);
                onClose();
            }}
            title="临时密码"
            description={
                <>
                    这是 <span className="text-ink">{value?.email}</span>{" "}
                    的新密码，只显示这一次。请通过安全渠道告诉用户，并提醒对方登录后修改。
                </>
            }
            footer={
                <Button onClick={onClose} autoFocus>
                    我已保存
                </Button>
            }
        >
            <div className="flex gap-2">
                <input
                    readOnly
                    value={value?.password ?? ""}
                    aria-label="临时密码"
                    onFocus={(event) => event.target.select()}
                    className={`${inputClass} numeric text-base tracking-wider`}
                />
                <Button
                    variant="secondary"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(
                                value?.password ?? "",
                            );
                            setCopied(true);
                        } catch {
                            /* Field stays selectable for manual copy. */
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
        </Dialog>
    );
}

export function UsersPage() {
    const list = usePanel<UserRow[]>("/admin/users");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const search = useSearch({ strict: false }) as { user?: number };
    const navigate = useNavigate();
    const action = useAdminAction();
    const toast = useToast();
    const [password, setPassword] = useState<{
        email: string;
        password: string;
    } | null>(null);
    const planName = new Map(plans.data?.map((p) => [p.id, p.name]));
    const selected = list.data?.find((u) => u.id === search.user);
    const select = (id: number | null) =>
        void navigate({
            to: "/admin/users",
            search: id === null ? {} : { user: id },
        });

    const resetPassword = async (user: UserRow) => {
        const result = await action.run({
            path: `/admin/users/${user.id}/password`,
            confirm: {
                title: `重置 ${user.email} 的密码？`,
                description:
                    "会生成一个临时密码并撤销该用户的全部登录。旧密码立即失效。",
                confirmLabel: "重置",
                tone: "danger",
            },
        });
        if (result)
            setPassword({
                email: user.email,
                password: String(result.password),
            });
    };

    const bulkBan = async (
        rows: UserRow[],
        banned: boolean,
        clear: () => void,
    ) => {
        const result = await action.run({
            path: "/admin/users/ban",
            body: { ids: rows.map((row) => row.id), banned },
            confirm: banned
                ? {
                      title: `封禁选中的 ${rows.length} 个用户？`,
                      description:
                          "管理员会被跳过。被封禁的用户立即退出登录，节点不再下发。",
                      confirmLabel: "封禁",
                      tone: "danger",
                  }
                : undefined,
        });
        if (!result) return;
        const { updated, skipped } = result as {
            updated: number;
            skipped: number;
        };
        toast.success(
            `已${banned ? "封禁" : "解封"} ${updated} 个用户${skipped ? `，跳过 ${skipped} 个管理员` : ""}`,
        );
        clear();
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="用户"
                description="最近注册的 200 个用户。点一行查看详情，可编辑订阅、入账、清零流量、重置密码或封禁。"
            />
            <WithEditor
                editor={
                    selected ? (
                        <UserPanel
                            key={selected.id}
                            user={selected}
                            plans={plans.data ?? []}
                            onClose={() => select(null)}
                            onPasswordReset={(user) => void resetPassword(user)}
                        />
                    ) : null
                }
            >
                <DataTable
                    id="users"
                    exportName="用户"
                    query={list}
                    rowKey={(row) => row.id}
                    selectedKey={search.user ?? null}
                    onRowClick={(row) => select(row.id)}
                    empty={{ title: "还没有用户" }}
                    searchText={(u) => `${u.id} ${u.email}`}
                    searchPlaceholder="邮箱或编号"
                    facets={[
                        {
                            key: "status",
                            label: "状态",
                            value: (u) => (u.banned ? "banned" : "active"),
                            labels: { active: "正常", banned: "已封禁" },
                        },
                        {
                            key: "plan",
                            label: "套餐",
                            value: (u) =>
                                u.planId
                                    ? (planName.get(u.planId) ?? `#${u.planId}`)
                                    : "未开通",
                        },
                        {
                            key: "verified",
                            label: "邮箱",
                            value: (u) =>
                                u.verifiedAt ? "verified" : "unverified",
                            labels: {
                                verified: "已验证",
                                unverified: "未验证",
                            },
                        },
                    ]}
                    bulkActions={(rows, clear) => (
                        <>
                            <Button
                                variant="danger"
                                size="sm"
                                busy={action.pending}
                                onClick={() => void bulkBan(rows, true, clear)}
                            >
                                封禁
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                busy={action.pending}
                                onClick={() => void bulkBan(rows, false, clear)}
                            >
                                解封
                            </Button>
                        </>
                    )}
                    rowActions={(user) => [
                        {
                            label: "查看详情",
                            icon: UserCircle,
                            onSelect: () => select(user.id),
                        },
                        {
                            label: "入账",
                            icon: Wallet,
                            onSelect: () => select(user.id),
                        },
                        { separator: true },
                        {
                            label: "重置密码",
                            icon: Key,
                            disabled: user.role === "admin",
                            onSelect: () => void resetPassword(user),
                        },
                        {
                            label: user.banned ? "解除封禁" : "封禁",
                            icon: Prohibit,
                            tone: user.banned ? undefined : "danger",
                            disabled: user.role === "admin",
                            onSelect: () => void toggleBan(action.run, user),
                        },
                    ]}
                    columns={[
                        {
                            key: "email",
                            header: "用户",
                            hideable: false,
                            sortValue: (u) => u.email,
                            cell: (u) => (
                                <>
                                    <p className="flex items-center gap-1.5">
                                        <span className="truncate">
                                            {u.email}
                                        </span>
                                        {u.role === "admin" ? (
                                            <Badge tone="info">管理员</Badge>
                                        ) : null}
                                    </p>
                                    <p className="numeric text-xs text-ink-subtle">
                                        #{u.id}
                                        {u.verifiedAt ? "" : " · 邮箱未验证"}
                                    </p>
                                </>
                            ),
                        },
                        {
                            key: "status",
                            header: "状态",
                            sortValue: (u) => u.banned,
                            exportValue: (u) => (u.banned ? "已封禁" : "正常"),
                            cell: (u) =>
                                u.banned ? (
                                    <Badge dot tone="danger">
                                        已封禁
                                    </Badge>
                                ) : (
                                    <Badge dot tone="success">
                                        正常
                                    </Badge>
                                ),
                        },
                        {
                            key: "plan",
                            header: "套餐",
                            sortValue: (u) =>
                                u.planId ? planName.get(u.planId) : null,
                            exportValue: (u) =>
                                u.planId ? planName.get(u.planId) : null,
                            cell: (u) =>
                                u.planId ? (
                                    <>
                                        <p>
                                            {planName.get(u.planId) ??
                                                `#${u.planId}`}
                                        </p>
                                        <p className="numeric text-xs text-ink-subtle">
                                            至 {formatDate(u.expiredAt)}
                                        </p>
                                    </>
                                ) : (
                                    <span className="text-ink-subtle">—</span>
                                ),
                        },
                        {
                            key: "expiredAt",
                            header: "到期",
                            sortValue: (u) =>
                                u.planId ? (u.expiredAt ?? Infinity) : null,
                            exportValue: (u) =>
                                u.planId ? formatDate(u.expiredAt) : null,
                            cell: (u) => (
                                <span className="numeric text-ink-muted">
                                    {u.planId ? formatDate(u.expiredAt) : "—"}
                                </span>
                            ),
                        },
                        {
                            key: "usage",
                            header: "流量",
                            sortValue: (u) =>
                                usedPercent(
                                    sumBytes(u.upload, u.download),
                                    u.transferEnable,
                                ),
                            exportValue: (u) =>
                                `${formatTraffic(sumBytes(u.upload, u.download))} / ${formatTraffic(u.transferEnable)}`,
                            cell: (u) => (
                                <UsageBar
                                    used={sumBytes(u.upload, u.download)}
                                    total={u.transferEnable}
                                />
                            ),
                        },
                        {
                            key: "balance",
                            header: "余额",
                            align: "right",
                            sortValue: (u) => u.balance,
                            exportValue: (u) => (u.balance / 100).toFixed(2),
                            cell: (u) => (
                                <span className="numeric">
                                    {formatMinor(u.balance)}
                                </span>
                            ),
                        },
                    ]}
                />
            </WithEditor>
            <TemporaryPassword
                value={password}
                onClose={() => setPassword(null)}
            />
        </div>
    );
}
