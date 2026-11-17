import { useState } from "react";
import { usePanel } from "../api/panel";
import { inputClass } from "../components/forms";
import { Badge, PageHeader } from "../components/primitives";
import { formatDateTime, formatMinor, periodLabel } from "../lib/format";
import { DataTable } from "./DataTable";
import type { AuditRow, LedgerRow, MailRow, OrderRow } from "./types";

const ORDER_STATUS = {
    paid: { label: "已支付", tone: "success" },
    pending: { label: "待支付", tone: "warn" },
    cancelled: { label: "已取消", tone: "neutral" },
} as const;

export function OrdersPage() {
    const list = usePanel<OrderRow[]>("/admin/orders");
    const [status, setStatus] = useState<"all" | OrderRow["status"]>("all");
    const rows = list.data?.filter(
        (o) => status === "all" || o.status === status,
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="订单"
                description="最近 200 笔订单。订单仅可通过余额支付，管理员不能代付。"
                actions={
                    <select
                        aria-label="按状态筛选"
                        value={status}
                        onChange={(e) =>
                            setStatus(e.target.value as typeof status)
                        }
                        className={`${inputClass} w-36`}
                    >
                        <option value="all">全部状态</option>
                        <option value="pending">待支付</option>
                        <option value="paid">已支付</option>
                        <option value="cancelled">已取消</option>
                    </select>
                }
            />
            <DataTable
                query={{ ...list, data: rows }}
                rowKey={(row) => row.id}
                empty={{ title: "没有符合条件的订单" }}
                columns={[
                    {
                        key: "user",
                        header: "用户",
                        cell: (o) => (
                            <>
                                <p className="truncate">{o.user.email}</p>
                                <p className="numeric text-xs text-ink-subtle">
                                    {o.id.slice(0, 8)}
                                </p>
                            </>
                        ),
                    },
                    {
                        key: "plan",
                        header: "套餐",
                        cell: (o) => (
                            <>
                                {o.planName}
                                <span className="ml-1.5 text-xs text-ink-muted">
                                    {periodLabel(o.period)}
                                </span>
                            </>
                        ),
                    },
                    {
                        key: "status",
                        header: "状态",
                        cell: (o) => (
                            <Badge dot tone={ORDER_STATUS[o.status].tone}>
                                {ORDER_STATUS[o.status].label}
                            </Badge>
                        ),
                    },
                    {
                        key: "amount",
                        header: "金额",
                        align: "right",
                        cell: (o) => (
                            <span className="numeric">
                                {formatMinor(o.amountMinor)}
                            </span>
                        ),
                    },
                    {
                        key: "createdAt",
                        header: "创建时间",
                        align: "right",
                        cell: (o) => (
                            <span className="numeric text-ink-muted">
                                {formatDateTime(o.createdAt)}
                            </span>
                        ),
                    },
                ]}
            />
        </div>
    );
}

export function LedgerPage() {
    const list = usePanel<LedgerRow[]>("/admin/ledger");
    return (
        <div className="space-y-6">
            <PageHeader
                title="余额流水"
                description="最近 200 笔余额变动，包括手动入账和订单扣款。流水不会被删除。"
            />
            <DataTable
                query={list}
                rowKey={(row) => row.id}
                empty={{ title: "还没有余额变动" }}
                columns={[
                    {
                        key: "user",
                        header: "用户",
                        cell: (e) => (
                            <span className="numeric">#{e.userId}</span>
                        ),
                    },
                    {
                        key: "kind",
                        header: "类型",
                        cell: (e) =>
                            e.orderId ? (
                                <Badge>订单扣款</Badge>
                            ) : (
                                <Badge tone="info">手动入账</Badge>
                            ),
                    },
                    {
                        key: "reason",
                        header: "说明",
                        className: "max-w-xs whitespace-normal",
                        cell: (e) => (
                            <span className="line-clamp-2 text-ink-muted">
                                {e.reason ??
                                    (e.orderId
                                        ? `订单 ${e.orderId.slice(0, 8)}`
                                        : "—")}
                                {e.actorId ? (
                                    <span className="numeric ml-1 text-ink-subtle">
                                        · 操作人 #{e.actorId}
                                    </span>
                                ) : null}
                            </span>
                        ),
                    },
                    {
                        key: "amount",
                        header: "金额",
                        align: "right",
                        cell: (e) => (
                            <span
                                className={`numeric ${e.amountMinor > 0 ? "text-signal" : ""}`}
                            >
                                {e.amountMinor > 0 ? "+" : ""}
                                {formatMinor(e.amountMinor)}
                            </span>
                        ),
                    },
                    {
                        key: "createdAt",
                        header: "时间",
                        align: "right",
                        cell: (e) => (
                            <span className="numeric text-ink-muted">
                                {formatDateTime(e.createdAt)}
                            </span>
                        ),
                    },
                ]}
            />
        </div>
    );
}

export function AuditPage() {
    const list = usePanel<AuditRow[]>("/admin/audit");
    return (
        <div className="space-y-6">
            <PageHeader
                title="审计日志"
                description="最近 200 条管理操作：入账、封禁、流量重置、套餐与节点变更等。"
            />
            <DataTable
                query={list}
                rowKey={(row) => row.id}
                empty={{ title: "还没有审计记录" }}
                columns={[
                    {
                        key: "action",
                        header: "操作",
                        cell: (a) => (
                            <code className="numeric text-xs">{a.action}</code>
                        ),
                    },
                    {
                        key: "actor",
                        header: "操作人",
                        cell: (a) => (
                            <span className="numeric text-ink-muted">
                                {a.actorId ? `#${a.actorId}` : "系统"}
                            </span>
                        ),
                    },
                    {
                        key: "target",
                        header: "对象",
                        cell: (a) => (
                            <span className="numeric">{a.target}</span>
                        ),
                    },
                    {
                        key: "detail",
                        header: "详情",
                        className: "max-w-sm whitespace-normal",
                        cell: (a) => (
                            <code className="numeric line-clamp-2 break-all text-xs text-ink-muted">
                                {JSON.stringify(a.detail)}
                            </code>
                        ),
                    },
                    {
                        key: "createdAt",
                        header: "时间",
                        align: "right",
                        cell: (a) => (
                            <span className="numeric text-ink-muted">
                                {formatDateTime(a.createdAt)}
                            </span>
                        ),
                    },
                ]}
            />
        </div>
    );
}

function mailStatus(mail: MailRow) {
    if (mail.sentAt) return { label: "已发送", tone: "success" } as const;
    if (mail.attempts >= 5) return { label: "已放弃", tone: "danger" } as const;
    if (mail.attempts > 0) return { label: "重试中", tone: "warn" } as const;
    return { label: "排队中", tone: "neutral" } as const;
}

export function MailPage() {
    const list = usePanel<MailRow[]>("/admin/mail");
    return (
        <div className="space-y-6">
            <PageHeader
                title="邮件队列"
                description="最近 100 封邮件。后台每 5 秒发送一次，失败指数退避，最多尝试 5 次；记录保留 7 天。"
            />
            <DataTable
                query={list}
                rowKey={(row) => row.id}
                empty={{
                    title: "队列为空",
                    description: "验证邮件、找回密码邮件会出现在这里。",
                }}
                columns={[
                    {
                        key: "to",
                        header: "收件人",
                        cell: (m) => <span className="truncate">{m.to}</span>,
                    },
                    { key: "subject", header: "主题", cell: (m) => m.subject },
                    {
                        key: "status",
                        header: "状态",
                        cell: (m) => {
                            const status = mailStatus(m);
                            return (
                                <Badge dot tone={status.tone}>
                                    {status.label}
                                </Badge>
                            );
                        },
                    },
                    {
                        key: "attempts",
                        header: "尝试",
                        align: "right",
                        cell: (m) => (
                            <span className="numeric">{m.attempts}</span>
                        ),
                    },
                    {
                        key: "time",
                        header: "发送 / 下次尝试",
                        align: "right",
                        cell: (m) => (
                            <span className="numeric text-ink-muted">
                                {formatDateTime(m.sentAt ?? m.nextAttempt)}
                            </span>
                        ),
                    },
                ]}
            />
        </div>
    );
}
