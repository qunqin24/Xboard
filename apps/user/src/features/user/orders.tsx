import { type ColumnDef } from "@tanstack/react-table";
import type { Order } from "@xboard/contracts";
import { Link } from "@tanstack/react-router";
import {
    Banknote,
    CircleCheck,
    CircleX,
    Clock,
    Package,
    TimerOff,
    X,
    type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOrderAction, useOrders } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
} from "@/components/data-table";
import { Page } from "@/components/layout/page";
import { EmptyState } from "@/components/empty-state";
import { IconBlock } from "@/components/ui/icon-block";
import { IconText } from "@/components/icon-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    formatDateTime,
    formatSettlement,
    formatTraffic,
    periodLabel,
} from "@/lib/format";
import { orderStatus } from "./status";

/** Keyed by the labels orderStatus() returns. */
const STATUS_ICON: Record<string, LucideIcon> = {
    已开通: CircleCheck,
    待支付: Clock,
    已取消: CircleX,
    已超时: TimerOff,
};

export function Orders() {
    const orders = useOrders();
    const action = useOrderAction();
    const [cancelling, setCancelling] = useState<Order | null>(null);

    const columns: ColumnDef<Order>[] = [
        {
            accessorKey: "planName",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="套餐" />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <IconBlock size="sm">
                        <Package />
                    </IconBlock>
                    <div>
                        <p className="font-medium">
                            {row.original.planName}
                            <span className="ms-2 text-muted-foreground">
                                {periodLabel(row.original.period)}
                            </span>
                        </p>
                        <p className="numeric text-xs text-muted-foreground">
                            {row.original.kind === "traffic_reset"
                                ? "清零当前用量"
                                : `${formatTraffic(row.original.transferBytes)} · ${row.original.period === "onetime" ? "长期有效" : `${row.original.durationDays} 天`}`}
                        </p>
                    </div>
                </div>
            ),
            meta: { title: "套餐" },
            filterFn: inFilter,
        },
        {
            id: "status",
            accessorFn: (order) =>
                orderStatus(order.status, order.expiresAt).label,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ getValue, row }) => {
                const label = getValue<string>();
                const Icon = STATUS_ICON[label] ?? Clock;
                return (
                    <Badge
                        variant={
                            orderStatus(
                                row.original.status,
                                row.original.expiresAt,
                            ).tone
                        }
                    >
                        <Icon />
                        {label}
                    </Badge>
                );
            },
            meta: { title: "状态" },
            filterFn: inFilter,
        },
        {
            accessorKey: "payableMinor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="金额" />
            ),
            cell: ({ row }) => (
                <IconText icon={Banknote}>
                    {formatSettlement(row.original.payableMinor)}
                </IconText>
            ),
            meta: {
                title: "金额",
                exportValue: (o) => (o.payableMinor / 100).toFixed(2),
            },
        },
        {
            accessorKey: "createdAt",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="创建时间" />
            ),
            cell: ({ row }) => (
                <IconText icon={Clock} className="text-muted-foreground">
                    {formatDateTime(row.original.createdAt)}
                </IconText>
            ),
            meta: { title: "创建时间" },
        },
        {
            id: "actions",
            enableHiding: false,
            cell: ({ row }) => {
                const status = orderStatus(
                    row.original.status,
                    row.original.expiresAt,
                );
                return (
                    <div className="flex items-center justify-end gap-inline">
                        <Button
                            asChild
                            size="sm"
                            variant={status.payable ? "default" : "ghost"}
                        >
                            <Link
                                to="/orders/$id"
                                params={{ id: row.original.id }}
                            >
                                {status.payable ? "去支付" : "详情"}
                            </Link>
                        </Button>
                        {status.payable ? (
                            <RowActions
                                actions={[
                                    {
                                        label: "取消订单",
                                        icon: X,
                                        destructive: true,
                                        onSelect: () =>
                                            setCancelling(row.original),
                                    },
                                ]}
                            />
                        ) : null}
                    </div>
                );
            },
        },
    ];

    return (
        <Page
            title="我的订单"
            description="显示最近 50 笔订单"
            help="待支付订单 30 分钟后自动失效。"
        >
            <DataTable
                data={orders.data}
                isLoading={orders.isPending}
                columns={columns}
                getRowId={(order) => order.id}
                searchPlaceholder="搜索套餐…"
                exportName="我的订单"
                error={orders.error}
                onRetry={() => orders.refetch()}
                emptyText={
                    <EmptyState
                        title="暂无订单"
                        action={
                            <Button asChild variant="outline" size="sm">
                                <Link to="/plans">选购套餐</Link>
                            </Button>
                        }
                    />
                }
                filters={[
                    {
                        columnId: "status",
                        title: "状态",
                        options: ["待支付", "已开通", "已超时", "已取消"].map(
                            (v) => ({ label: v, value: v }),
                        ),
                    },
                ]}
            />
            <ConfirmDialog
                open={cancelling !== null}
                onOpenChange={(open) => !open && setCancelling(null)}
                title="取消订单"
                desc="取消后需重新下单。"
                confirmText="取消订单"
                cancelBtnText="返回"
                destructive
                isLoading={action.isPending}
                handleConfirm={() =>
                    cancelling &&
                    action.mutate(
                        { id: cancelling.id, action: "cancel" },
                        {
                            onSuccess: () => {
                                toast.success("订单已取消");
                                setCancelling(null);
                            },
                        },
                    )
                }
            />
        </Page>
    );
}
