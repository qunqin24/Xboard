import { usePanel } from "../api/panel";
import { Badge, PageHeader } from "../components/primitives";
import { formatDateTime, formatMinor, periodLabel } from "../lib/format";
import { DataTable } from "./DataTable";
import type { AuditRow, LedgerRow, MailRow, OrderRow } from "./types";

const ORDER_STATUS = {
    paid: { label: "已支付", tone: "success" },
    pending: { label: "待支付", tone: "warn" },
    cancelled: { label: "已取消", tone: "neutral" },
} as const;

const time = (value: string | null) => (value ? Date.parse(value) : null);

export function OrdersPage() {
    const list = usePanel<OrderRow[]>("/admin/orders");

    return (
        <div className="space-y-6">
            <PageHeader
                title="订单"
                description="最近 200 笔订单。订单只能由用户用余额支付，管理员不能代付。"
            />
            <DataTable
                id="orders"
                exportName="订单"
                query={list}
                rowKey={(row) => row.id}
                empty={{ title: "还没有订单" }}
                searchText={(o) => `${o.user.email} ${o.id} ${o.planName}`}
                searchPlaceholder="邮箱、订单号、套餐"
                facets={[
                    {
                        key: "status",
                        label: "状态",
                        value: (o) => o.status,
                        labels: {
                            pending: "待支付",
                            paid: "已支付",
                            cancelled: "已取消",
                        },
                    },
                    { key: "plan", label: "套餐", value: (o) => o.planName },
                ]}
                columns={[
                    {
                        key: "user",
                        header: "用户",
                        hideable: false,
                        sortValue: (o) => o.user.email,
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
                        sortValue: (o) => o.planName,
                        exportValue: (o) =>
                            `${o.planName} ${periodLabel(o.period)}`,
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
                        sortValue: (o) => o.status,
                        exportValue: (o) => ORDER_STATUS[o.status].label,
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
                        sortValue: (o) => o.amountMinor,
                        exportValue: (o) => (o.amountMinor / 100).toFixed(2),
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
                        sortValue: (o) => time(o.createdAt),
                        exportValue: (o) => o.createdAt,
                        cell: (o) => (
                            <span className="numeric text-ink-muted">
                                {formatDateTime(o.createdAt)}
                            </span>
                        ),
                    },
                    {
                        key: "paidAt",
                        header: "支付时间",
                        align: "right",
                        sortValue: (o) => time(o.paidAt),
                        exportValue: (o) => o.paidAt,
                        cell: (o) => (
                            <span className="numeric text-ink-muted">
                                {formatDateTime(o.paidAt)}
                            </span>
                        ),
                    },
                    {
                        key: "id",
                        header: "订单号",
                        exportValue: (o) => o.id,
                        cell: (o) => (
                            <span className="numeric text-xs text-ink-muted">
                                {o.id}
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
                id="ledger"
                exportName="余额流水"
                query={list}
                rowKey={(row) => row.id}
                empty={{ title: "还没有余额变动" }}
                searchText={(e) =>
                    `${e.userId} ${e.reason ?? ""} ${e.orderId ?? ""}`
                }
                searchPlaceholder="用户编号、说明"
                facets={[
                    {
                        key: "kind",
                        label: "类型",
                        value: (e) => (e.orderId ? "order" : "credit"),
                        labels: { credit: "手动入账", order: "订单扣款" },
                    },
                ]}
                columns={[
                    {
                        key: "user",
                        header: "用户",
                        hideable: false,
                        sortValue: (e) => e.userId,
                        cell: (e) => (
                            <span className="numeric">#{e.userId}</span>
                        ),
                    },
                    {
                        key: "kind",
                        header: "类型",
                        exportValue: (e) =>
                            e.orderId ? "订单扣款" : "手动入账",
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
                        exportValue: (e) => e.reason ?? e.orderId,
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
                        sortValue: (e) => e.amountMinor,
                        exportValue: (e) => (e.amountMinor / 100).toFixed(2),
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
                        sortValue: (e) => time(e.createdAt),
                        exportValue: (e) => e.createdAt,
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

const AUDIT_LABELS: Record<string, string> = {
    "balance.credit": "手动入账",
    "user.ban": "封禁 / 解封",
    "user.update": "编辑订阅",
    "user.password_reset": "重置密码",
    "traffic.reset": "流量清零",
    "plan.save": "保存套餐",
    "plan.delete": "删除套餐",
    "node.save": "保存节点",
    "node.rotate": "重置节点密钥",
    "node.delete": "删除节点",
    "notice.create": "发布公告",
    "notice.update": "编辑公告",
    "notice.delete": "删除公告",
    "settings.update": "系统设置",
};

export function AuditPage() {
    const list = usePanel<AuditRow[]>("/admin/audit");
    return (
        <div className="space-y-6">
            <PageHeader
                title="审计日志"
                description="最近 200 条管理操作：入账、封禁、流量重置、套餐与节点变更等。"
            />
            <DataTable
                id="audit"
                exportName="审计日志"
                query={list}
                rowKey={(row) => row.id}
                empty={{ title: "还没有审计记录" }}
                searchText={(a) =>
                    `${a.action} ${a.target} ${JSON.stringify(a.detail)}`
                }
                searchPlaceholder="对象、详情"
                facets={[
                    {
                        key: "action",
                        label: "操作",
                        value: (a) => a.action,
                        labels: AUDIT_LABELS,
                    },
                ]}
                columns={[
                    {
                        key: "action",
                        header: "操作",
                        hideable: false,
                        sortValue: (a) => a.action,
                        exportValue: (a) => AUDIT_LABELS[a.action] ?? a.action,
                        cell: (a) => (
                            <>
                                <p>{AUDIT_LABELS[a.action] ?? a.action}</p>
                                <code className="numeric text-xs text-ink-subtle">
                                    {a.action}
                                </code>
                            </>
                        ),
                    },
                    {
                        key: "actor",
                        header: "操作人",
                        sortValue: (a) => a.actorId,
                        cell: (a) => (
                            <span className="numeric text-ink-muted">
                                {a.actorId ? `#${a.actorId}` : "系统"}
                            </span>
                        ),
                    },
                    {
                        key: "target",
                        header: "对象",
                        sortValue: (a) => a.target,
                        cell: (a) => (
                            <span className="numeric">{a.target}</span>
                        ),
                    },
                    {
                        key: "detail",
                        header: "详情",
                        className: "max-w-sm whitespace-normal",
                        exportValue: (a) => JSON.stringify(a.detail),
                        cell: (a) => (
                            <code className="numeric line-clamp-2 text-xs break-all text-ink-muted">
                                {JSON.stringify(a.detail)}
                            </code>
                        ),
                    },
                    {
                        key: "createdAt",
                        header: "时间",
                        align: "right",
                        sortValue: (a) => time(a.createdAt),
                        exportValue: (a) => a.createdAt,
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
    if (mail.sentAt) return "sent";
    if (mail.attempts >= 5) return "failed";
    if (mail.attempts > 0) return "retrying";
    return "queued";
}

const MAIL_STATUS = {
    sent: { label: "已发送", tone: "success" },
    failed: { label: "已放弃", tone: "danger" },
    retrying: { label: "重试中", tone: "warn" },
    queued: { label: "排队中", tone: "neutral" },
} as const;

export function MailPage() {
    const list = usePanel<MailRow[]>("/admin/mail");
    return (
        <div className="space-y-6">
            <PageHeader
                title="邮件队列"
                description="最近 100 封邮件。后台每 5 秒发送一次，失败按指数退避，最多尝试 5 次；记录保留 7 天。"
            />
            <DataTable
                id="mail"
                exportName="邮件队列"
                query={list}
                rowKey={(row) => row.id}
                empty={{
                    title: "队列为空",
                    description: "验证邮件、找回密码邮件会出现在这里。",
                }}
                searchText={(m) => `${m.to} ${m.subject}`}
                searchPlaceholder="收件人、主题"
                facets={[
                    {
                        key: "status",
                        label: "状态",
                        value: mailStatus,
                        labels: Object.fromEntries(
                            Object.entries(MAIL_STATUS).map(([k, v]) => [
                                k,
                                v.label,
                            ]),
                        ),
                    },
                ]}
                columns={[
                    {
                        key: "to",
                        header: "收件人",
                        hideable: false,
                        sortValue: (m) => m.to,
                        cell: (m) => <span className="truncate">{m.to}</span>,
                    },
                    {
                        key: "subject",
                        header: "主题",
                        sortValue: (m) => m.subject,
                        cell: (m) => m.subject,
                    },
                    {
                        key: "status",
                        header: "状态",
                        sortValue: mailStatus,
                        exportValue: (m) => MAIL_STATUS[mailStatus(m)].label,
                        cell: (m) => {
                            const status = MAIL_STATUS[mailStatus(m)];
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
                        sortValue: (m) => m.attempts,
                        cell: (m) => (
                            <span className="numeric">{m.attempts}</span>
                        ),
                    },
                    {
                        key: "time",
                        header: "发送 / 下次尝试",
                        align: "right",
                        sortValue: (m) => time(m.sentAt ?? m.nextAttempt),
                        exportValue: (m) => m.sentAt ?? m.nextAttempt,
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
