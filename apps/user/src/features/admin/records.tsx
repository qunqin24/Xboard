import { type ColumnDef } from "@tanstack/react-table";
import { queryString } from "@/api/client";
import { usePanel } from "@/api/panel";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    useServerTable,
} from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { LongText } from "@/components/long-text";
import { formatDateTime, formatMinor, periodLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MAIL_STATUS_TONE, ORDER_STATUS } from "./status";
import type { AuditRow, LedgerRow, MailRow, OrderRow, Paged } from "./types";

const timeColumn = <T extends object>(
    key: keyof T & string,
    title: string,
): ColumnDef<T> => ({
    id: key,
    accessorFn: (row) => (row[key] ? Date.parse(String(row[key])) : null),
    header: ({ column }) => (
        <DataTableColumnHeader column={column} title={title} />
    ),
    cell: ({ row }) => (
        <span className="numeric text-muted-foreground">
            {formatDateTime(row.original[key] as string | null)}
        </span>
    ),
    sortUndefined: "last",
    meta: { title, exportValue: (row) => (row[key] as string | null) ?? "" },
});

export function AdminOrders() {
    const table = useServerTable();
    const list = usePanel<Paged<OrderRow>>(
        `/admin/orders${queryString({ ...table.query, status: table.filter("status") })}`,
        { keepPrevious: true },
    );
    const columns: ColumnDef<OrderRow>[] = [
        {
            id: "email",
            accessorFn: (o) => o.user.email,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="用户" />
            ),
            cell: ({ row }) => (
                <div>
                    <LongText className="max-w-52">
                        {row.original.user.email}
                    </LongText>
                    <p className="numeric text-xs text-muted-foreground">
                        {row.original.id.slice(0, 8)}
                    </p>
                </div>
            ),
            enableHiding: false,
            meta: { title: "用户" },
        },
        {
            accessorKey: "planName",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="套餐" />
            ),
            cell: ({ row }) => (
                <span>
                    {row.original.planName}
                    <span className="ms-2 text-muted-foreground">
                        {periodLabel(row.original.period)}
                    </span>
                </span>
            ),
            filterFn: inFilter,
            meta: { title: "套餐" },
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ row }) => (
                <Badge variant={ORDER_STATUS[row.original.status].tone}>
                    {ORDER_STATUS[row.original.status].label}
                </Badge>
            ),
            filterFn: inFilter,
            meta: {
                title: "状态",
                exportValue: (o) => ORDER_STATUS[o.status].label,
            },
        },
        {
            accessorKey: "amountMinor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="金额" />
            ),
            cell: ({ row }) => (
                <span className="numeric">
                    {formatMinor(row.original.amountMinor)}
                </span>
            ),
            meta: {
                title: "金额",
                exportValue: (o) => (o.amountMinor / 100).toFixed(2),
            },
        },
        timeColumn<OrderRow>("createdAt", "创建时间"),
        timeColumn<OrderRow>("paidAt", "支付时间"),
        {
            accessorKey: "id",
            header: "订单号",
            cell: ({ row }) => (
                <span className="numeric text-xs text-muted-foreground">
                    {row.original.id}
                </span>
            ),
            enableSorting: false,
            meta: { title: "订单号" },
        },
    ];

    return (
        <Page
            title="订单"
            description={list.data ? `共 ${list.data.total} 笔订单` : undefined}
            help="订单仅支持用户以余额支付，管理员无法代付。"
        >
            <DataTable
                data={list.data?.items}
                server={{
                    state: table.state,
                    onStateChange: table.setState,
                    rowCount: list.data?.total,
                }}
                isLoading={list.isPending}
                error={list.isError ? list.error : undefined}
                onRetry={() => void list.refetch()}
                columns={columns}
                getRowId={(o) => o.id}
                searchPlaceholder="邮箱、套餐或单号…"
                exportName="订单"
                initialHidden={{ id: false, paidAt: false }}
                filters={[
                    {
                        columnId: "status",
                        title: "状态",
                        options: Object.entries(ORDER_STATUS).map(
                            ([value, s]) => ({ value, label: s.label }),
                        ),
                    },
                ]}
            />
        </Page>
    );
}

export function AdminLedger() {
    const table = useServerTable();
    const list = usePanel<Paged<LedgerRow>>(
        `/admin/ledger${queryString({ ...table.query, kind: table.filter("kind") })}`,
        { keepPrevious: true },
    );
    const columns: ColumnDef<LedgerRow>[] = [
        {
            id: "user",
            accessorFn: (e) => e.user.email,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="用户" />
            ),
            cell: ({ row }) => (
                <div>
                    <LongText className="max-w-52">
                        {row.original.user.email}
                    </LongText>
                    <p className="numeric text-xs text-muted-foreground">
                        #{row.original.userId}
                    </p>
                </div>
            ),
            enableHiding: false,
            meta: { title: "用户" },
        },
        {
            id: "kind",
            accessorFn: (e) => (e.orderId ? "订单扣款" : "手动入账"),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="类型" />
            ),
            cell: ({ getValue }) => (
                <Badge variant="outline">{getValue<string>()}</Badge>
            ),
            filterFn: inFilter,
            meta: { title: "类型" },
        },
        {
            id: "reason",
            accessorFn: (e) =>
                e.reason ?? (e.orderId ? `订单 ${e.orderId.slice(0, 8)}` : ""),
            header: "说明",
            cell: ({ row, getValue }) => (
                <div className="max-w-80">
                    <LongText>{getValue<string>() || "—"}</LongText>
                    {row.original.actorId ? (
                        <p className="numeric text-xs text-muted-foreground">
                            操作人 #{row.original.actorId}
                        </p>
                    ) : null}
                </div>
            ),
            enableSorting: false,
            meta: { title: "说明" },
        },
        {
            accessorKey: "amountMinor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="金额" />
            ),
            cell: ({ row }) => (
                <span
                    className={cn(
                        "numeric",
                        row.original.amountMinor > 0 && "text-success",
                    )}
                >
                    {row.original.amountMinor > 0 ? "+" : ""}
                    {formatMinor(row.original.amountMinor)}
                </span>
            ),
            meta: {
                title: "金额",
                exportValue: (e) => (e.amountMinor / 100).toFixed(2),
            },
        },
        timeColumn<LedgerRow>("createdAt", "时间"),
    ];
    return (
        <Page
            title="余额流水"
            description={
                list.data ? `共 ${list.data.total} 笔余额变动` : undefined
            }
            help="流水记录不可删除。"
        >
            <DataTable
                data={list.data?.items}
                server={{
                    state: table.state,
                    onStateChange: table.setState,
                    rowCount: list.data?.total,
                }}
                isLoading={list.isPending}
                error={list.isError ? list.error : undefined}
                onRetry={() => void list.refetch()}
                columns={columns}
                getRowId={(e) => e.id}
                searchPlaceholder="邮箱或说明…"
                exportName="余额流水"
                filters={[
                    {
                        columnId: "kind",
                        title: "类型",
                        options: [
                            { value: "credit", label: "手动入账" },
                            { value: "order", label: "订单扣款" },
                        ],
                    },
                ]}
            />
        </Page>
    );
}

export const AUDIT_LABELS: Record<string, string> = {
    "balance.credit": "手动入账",
    "user.ban": "封禁 / 解封",
    "user.update": "编辑订阅",
    "user.password_reset": "重置密码",
    "user.credentials_rotate": "更换节点凭据",
    "admin.bootstrap": "初始化管理员",
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

export function AdminAudit() {
    const table = useServerTable();
    const list = usePanel<Paged<AuditRow>>(
        `/admin/audit${queryString({ ...table.query, action: table.filter("action") })}`,
        { keepPrevious: true },
    );
    const columns: ColumnDef<AuditRow>[] = [
        {
            accessorKey: "action",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="操作" />
            ),
            cell: ({ row }) => (
                <div>
                    <p>
                        {AUDIT_LABELS[row.original.action] ??
                            row.original.action}
                    </p>
                    <code className="numeric text-xs text-muted-foreground">
                        {row.original.action}
                    </code>
                </div>
            ),
            filterFn: inFilter,
            enableHiding: false,
            meta: {
                title: "操作",
                exportValue: (a) => AUDIT_LABELS[a.action] ?? a.action,
            },
        },
        {
            accessorKey: "actorId",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="操作人" />
            ),
            cell: ({ row }) => (
                <span className="numeric text-muted-foreground">
                    {row.original.actorId === null
                        ? "系统"
                        : `#${row.original.actorId}`}
                </span>
            ),
            meta: { title: "操作人" },
        },
        {
            accessorKey: "target",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="对象" />
            ),
            cell: ({ row }) => (
                <span className="numeric">{row.original.target}</span>
            ),
            meta: { title: "对象" },
        },
        {
            id: "detail",
            accessorFn: (a) => JSON.stringify(a.detail),
            header: "详情",
            cell: ({ getValue }) => (
                <LongText className="numeric max-w-96 text-xs text-muted-foreground">
                    {getValue<string>()}
                </LongText>
            ),
            enableSorting: false,
            meta: { title: "详情" },
        },
        timeColumn<AuditRow>("createdAt", "时间"),
    ];
    return (
        <Page
            title="审计日志"
            description={
                list.data ? `共 ${list.data.total} 条管理操作` : undefined
            }
        >
            <DataTable
                data={list.data?.items}
                server={{
                    state: table.state,
                    onStateChange: table.setState,
                    rowCount: list.data?.total,
                }}
                isLoading={list.isPending}
                error={list.isError ? list.error : undefined}
                onRetry={() => void list.refetch()}
                columns={columns}
                getRowId={(a) => String(a.id)}
                searchPlaceholder="操作或对象…"
                exportName="审计日志"
                filters={[
                    {
                        columnId: "action",
                        title: "操作",
                        options: Object.entries(AUDIT_LABELS).map(
                            ([value, label]) => ({ value, label }),
                        ),
                    },
                ]}
            />
        </Page>
    );
}

function mailStatus(mail: MailRow) {
    if (mail.sentAt) return "已发送";
    if (mail.attempts >= 5) return "已放弃";
    if (mail.attempts > 0) return "重试中";
    return "排队中";
}

export function AdminMail() {
    const list = usePanel<MailRow[]>("/admin/mail");
    const columns: ColumnDef<MailRow>[] = [
        {
            accessorKey: "to",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="收件人" />
            ),
            enableHiding: false,
            meta: { title: "收件人" },
        },
        {
            accessorKey: "subject",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="主题" />
            ),
            meta: { title: "主题" },
        },
        {
            id: "status",
            accessorFn: mailStatus,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ getValue }) => {
                const value = getValue<string>();
                return (
                    <Badge variant={MAIL_STATUS_TONE[value] ?? "secondary"}>
                        {value}
                    </Badge>
                );
            },
            filterFn: inFilter,
            meta: { title: "状态" },
        },
        {
            accessorKey: "lastError",
            header: "失败原因",
            cell: ({ row }) =>
                row.original.lastError ? (
                    <LongText className="numeric max-w-64 text-xs text-muted-foreground">
                        {row.original.lastError}
                    </LongText>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
            enableSorting: false,
            meta: { title: "失败原因" },
        },
        {
            accessorKey: "attempts",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="尝试次数" />
            ),
            cell: ({ row }) => (
                <span className="numeric">{row.original.attempts}</span>
            ),
            meta: { title: "尝试次数" },
        },
        {
            id: "time",
            accessorFn: (m) => Date.parse(m.sentAt ?? m.nextAttempt),
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title="发送 / 下次尝试"
                />
            ),
            cell: ({ row }) => (
                <span className="numeric text-muted-foreground">
                    {formatDateTime(
                        row.original.sentAt ?? row.original.nextAttempt,
                    )}
                </span>
            ),
            meta: {
                title: "发送 / 下次尝试",
                exportValue: (m) => m.sentAt ?? m.nextAttempt,
            },
        },
    ];
    return (
        <Page
            title="邮件队列"
            description="显示最近 100 封邮件"
            help="系统每 5 秒处理一次发送队列；失败后按指数退避重试，最多 5 次；记录保留 7 天。"
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                error={list.isError ? list.error : undefined}
                onRetry={() => void list.refetch()}
                columns={columns}
                getRowId={(m) => String(m.id)}
                searchPlaceholder="收件人、主题…"
                exportName="邮件队列"
                emptyText={
                    <EmptyState
                        title="暂无邮件"
                        description="验证邮件和密码找回邮件将显示在此处。"
                    />
                }
                filters={[
                    {
                        columnId: "status",
                        title: "状态",
                        options: ["已发送", "排队中", "重试中", "已放弃"].map(
                            (v) => ({ value: v, label: v }),
                        ),
                    },
                ]}
            />
        </Page>
    );
}
