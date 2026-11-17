import { type ColumnDef } from "@tanstack/react-table";
import { usePanel } from "@/api/panel";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
} from "@/components/data-table";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { LongText } from "@/components/long-text";
import { formatDateTime, formatMinor, periodLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditRow, LedgerRow, MailRow, OrderRow } from "./types";

const ORDER_STATUS: Record<
    OrderRow["status"],
    { label: string; variant: "default" | "outline" | "secondary" }
> = {
    paid: { label: "已支付", variant: "default" },
    pending: { label: "待支付", variant: "outline" },
    cancelled: { label: "已取消", variant: "secondary" },
};

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
    const list = usePanel<OrderRow[]>("/admin/orders");
    const plans = [...new Set(list.data?.map((o) => o.planName))];
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
                    <span className="ms-1.5 text-muted-foreground">
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
                <Badge variant={ORDER_STATUS[row.original.status].variant}>
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
            description="最近 200 笔订单。订单只能由用户用余额支付，管理员不能代付。"
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                columns={columns}
                getRowId={(o) => o.id}
                searchPlaceholder="邮箱、套餐、订单号…"
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
                    {
                        columnId: "planName",
                        title: "套餐",
                        options: plans.map((p) => ({ value: p, label: p })),
                    },
                ]}
            />
        </Page>
    );
}

export function AdminLedger() {
    const list = usePanel<LedgerRow[]>("/admin/ledger");
    const columns: ColumnDef<LedgerRow>[] = [
        {
            accessorKey: "userId",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="用户" />
            ),
            cell: ({ row }) => (
                <span className="numeric">#{row.original.userId}</span>
            ),
            meta: { title: "用户" },
        },
        {
            id: "kind",
            accessorFn: (e) => (e.orderId ? "订单扣款" : "手动入账"),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="类型" />
            ),
            cell: ({ getValue }) => (
                <Badge
                    variant={
                        getValue() === "手动入账" ? "default" : "secondary"
                    }
                >
                    {getValue<string>()}
                </Badge>
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
                        row.original.amountMinor > 0 &&
                            "text-emerald-600 dark:text-emerald-400",
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
            description="最近 200 笔余额变动，包括手动入账和订单扣款。流水不会被删除。"
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                columns={columns}
                getRowId={(e) => e.id}
                searchPlaceholder="用户编号、说明…"
                exportName="余额流水"
                filters={[
                    {
                        columnId: "kind",
                        title: "类型",
                        options: ["手动入账", "订单扣款"].map((v) => ({
                            value: v,
                            label: v,
                        })),
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
    const list = usePanel<AuditRow[]>("/admin/audit");
    const actions = [...new Set(list.data?.map((a) => a.action))];
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
                    #{row.original.actorId}
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
            description="最近 200 条管理操作：入账、封禁、流量重置、套餐与节点变更等。"
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                columns={columns}
                getRowId={(a) => String(a.id)}
                searchPlaceholder="对象、详情…"
                exportName="审计日志"
                filters={[
                    {
                        columnId: "action",
                        title: "操作",
                        options: actions.map((a) => ({
                            value: a,
                            label: AUDIT_LABELS[a] ?? a,
                        })),
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
                    <Badge
                        variant={
                            value === "已放弃"
                                ? "destructive"
                                : value === "已发送"
                                  ? "default"
                                  : "outline"
                        }
                    >
                        {value}
                    </Badge>
                );
            },
            filterFn: inFilter,
            meta: { title: "状态" },
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
            description="最近 100 封邮件。后台每 5 秒发送一次，失败按指数退避，最多尝试 5 次；记录保留 7 天。"
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                columns={columns}
                getRowId={(m) => String(m.id)}
                searchPlaceholder="收件人、主题…"
                exportName="邮件队列"
                emptyText="队列为空。验证邮件和找回密码邮件会出现在这里。"
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
