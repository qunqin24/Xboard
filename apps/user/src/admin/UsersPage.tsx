import { MagnifyingGlass } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useCommand, usePanel } from "../api/panel";
import { Feedback, Field, Form, inputClass } from "../components/forms";
import { Badge, Button, PageHeader } from "../components/primitives";
import {
    formatDate,
    formatMinor,
    formatTraffic,
    sumBytes,
    usedPercent,
} from "../lib/format";
import { DataTable } from "./DataTable";
import { EditorPanel, WithEditor, yuanToMinor } from "./Editor";
import type { PlanRow, UserRow } from "./types";

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

function UserPanel({
    user,
    planName,
    onClose,
}: {
    user: UserRow;
    planName?: string;
    onClose: () => void;
}) {
    const credit = useCommand();
    const reset = useCommand();
    const ban = useCommand();
    const request = useRef<{ signature: string; id: string } | null>(null);
    const used = sumBytes(user.upload, user.download);

    return (
        <EditorPanel
            title={user.email}
            description={`用户 #${user.id}`}
            onClose={onClose}
        >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-surface-raised p-3 text-xs">
                <div>
                    <dt className="text-ink-muted">余额</dt>
                    <dd className="numeric mt-0.5 text-sm text-ink">
                        {formatMinor(user.balance)}
                    </dd>
                </div>
                <div>
                    <dt className="text-ink-muted">套餐</dt>
                    <dd className="mt-0.5 text-sm text-ink">
                        {planName ?? "未开通"}
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

            <section className="mt-6">
                <h3 className="text-sm font-medium text-ink">手动入账</h3>
                <p className="mt-1 mb-3 text-xs text-ink-muted">
                    写入余额流水和审计日志。同一金额和原因重复提交不会重复入账。
                </p>
                <Form
                    busy={credit.isPending}
                    label="确认入账"
                    submit={(form) => {
                        const body = {
                            amountMinor: yuanToMinor(form.get("amount")),
                            reason: String(form.get("reason")),
                        };
                        const signature = JSON.stringify(body);
                        if (request.current?.signature !== signature)
                            request.current = {
                                signature,
                                id: crypto.randomUUID(),
                            };
                        credit.mutate(
                            {
                                path: `/admin/users/${user.id}/credit`,
                                body: {
                                    ...body,
                                    requestId: request.current.id,
                                },
                            },
                            { onSuccess: () => (request.current = null) },
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
                <Feedback
                    error={credit.error}
                    success={credit.isSuccess}
                    successText="已入账。"
                />
            </section>

            <section className="mt-6 border-t border-line-subtle pt-5">
                <h3 className="text-sm font-medium text-ink">清零已用流量</h3>
                <p className="mt-1 mb-3 text-xs text-ink-muted">
                    上传和下载归零，额度和到期时间不变。
                </p>
                <Form
                    busy={reset.isPending}
                    label="清零流量"
                    variant="secondary"
                    submit={(form) =>
                        reset.mutate({
                            path: `/admin/users/${user.id}/reset-traffic`,
                            body: Object.fromEntries(form),
                        })
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
                <Feedback
                    error={reset.error}
                    success={reset.isSuccess}
                    successText="流量已清零。"
                />
            </section>

            <section className="mt-6 border-t border-line-subtle pt-5">
                <h3 className="text-sm font-medium text-ink">
                    {user.banned ? "解除封禁" : "封禁账户"}
                </h3>
                <p className="mt-1 mb-3 text-xs text-ink-muted">
                    {user.role === "admin"
                        ? "管理员账户不能被封禁。"
                        : user.banned
                          ? "解除后用户可以重新登录和使用节点。"
                          : "封禁会立刻撤销全部登录，节点也不再下发该用户。"}
                </p>
                <Button
                    variant={user.banned ? "secondary" : "danger"}
                    disabled={user.role === "admin"}
                    busy={ban.isPending}
                    onClick={() => {
                        if (
                            !user.banned &&
                            !confirm(`确定封禁 ${user.email} 吗？`)
                        )
                            return;
                        ban.mutate({
                            path: `/admin/users/${user.id}/ban`,
                            body: { banned: !user.banned },
                        });
                    }}
                >
                    {user.banned ? "解除封禁" : "封禁并撤销登录"}
                </Button>
                <Feedback error={ban.error} />
            </section>
        </EditorPanel>
    );
}

export function UsersPage() {
    const list = usePanel<UserRow[]>("/admin/users");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const planName = new Map(plans.data?.map((p) => [p.id, p.name]));
    const term = search.trim().toLowerCase();
    const rows = list.data?.filter((u) =>
        `${u.id} ${u.email}`.toLowerCase().includes(term),
    );
    const selected = list.data?.find((u) => u.id === selectedId);

    return (
        <div className="space-y-6">
            <PageHeader
                title="用户"
                description="最近注册的 200 个用户。点一行查看详情、入账、清零流量或封禁。"
                actions={
                    <label className="relative block w-64">
                        <span className="sr-only">搜索用户</span>
                        <MagnifyingGlass
                            aria-hidden
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="邮箱或编号"
                            className={`${inputClass} pl-9`}
                        />
                    </label>
                }
            />
            <WithEditor
                editor={
                    selected ? (
                        <UserPanel
                            key={selected.id}
                            user={selected}
                            planName={
                                selected.planId
                                    ? planName.get(selected.planId)
                                    : undefined
                            }
                            onClose={() => setSelectedId(null)}
                        />
                    ) : null
                }
            >
                <DataTable
                    query={{ ...list, data: rows }}
                    rowKey={(row) => row.id}
                    selectedKey={selectedId}
                    onRowClick={(row) => setSelectedId(row.id)}
                    empty={{ title: term ? "没有匹配的用户" : "还没有用户" }}
                    columns={[
                        {
                            key: "email",
                            header: "用户",
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
                            key: "usage",
                            header: "流量",
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
                            cell: (u) => (
                                <span className="numeric">
                                    {formatMinor(u.balance)}
                                </span>
                            ),
                        },
                    ]}
                />
            </WithEditor>
        </div>
    );
}
