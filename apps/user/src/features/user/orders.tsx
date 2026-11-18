import { type ColumnDef } from "@tanstack/react-table";
import type { Order } from "@xboard/contracts";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount, useOrderAction, useOrders } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
} from "@/components/data-table";
import { Page } from "@/components/layout/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    formatDateTime,
    formatMinor,
    formatTraffic,
    periodLabel,
} from "@/lib/format";
import { orderStatus } from "./status";

export function Orders() {
    const orders = useOrders();
    const account = useAccount();
    const action = useOrderAction();
    const [paying, setPaying] = useState<Order | null>(null);
    const [cancelling, setCancelling] = useState<Order | null>(null);
    const balance = account.data?.balanceMinor ?? 0;

    const columns: ColumnDef<Order>[] = [
        {
            accessorKey: "planName",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="套餐" />
            ),
            cell: ({ row }) => (
                <div>
                    <p className="font-medium">
                        {row.original.planName}
                        <span className="ms-2 text-muted-foreground">
                            {periodLabel(row.original.period)}
                        </span>
                    </p>
                    <p className="numeric text-xs text-muted-foreground">
                        {formatTraffic(row.original.transferBytes)} ·{" "}
                        {row.original.durationDays} 天
                    </p>
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
            cell: ({ getValue, row }) => (
                <Badge
                    variant={
                        orderStatus(row.original.status, row.original.expiresAt)
                            .tone
                    }
                >
                    {getValue<string>()}
                </Badge>
            ),
            meta: { title: "状态" },
            filterFn: inFilter,
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
        {
            accessorKey: "createdAt",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="创建时间" />
            ),
            cell: ({ row }) => (
                <span className="numeric text-muted-foreground">
                    {formatDateTime(row.original.createdAt)}
                </span>
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
                return status.payable ? (
                    <div className="flex items-center justify-end gap-inline">
                        <Button
                            size="sm"
                            onClick={() => setPaying(row.original)}
                        >
                            支付
                        </Button>
                        <RowActions
                            actions={[
                                {
                                    label: "取消订单",
                                    icon: X,
                                    destructive: true,
                                    onSelect: () => setCancelling(row.original),
                                },
                            ]}
                        />
                    </div>
                ) : null;
            },
        },
    ];

    const short = paying ? balance < paying.amountMinor : false;

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
                onRetry={() => void orders.refetch()}
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
                open={paying !== null}
                onOpenChange={(open) => !open && setPaying(null)}
                title="余额支付"
                desc={
                    paying ? (
                        <div className="space-y-group">
                            <p>
                                将从余额扣除{" "}
                                <strong className="numeric">
                                    {formatMinor(paying.amountMinor)}
                                </strong>
                                （当前余额{" "}
                                <span className="numeric">
                                    {formatMinor(balance)}
                                </span>
                                ）。支付后立即生效。
                            </p>
                            {short ? (
                                <Alert variant="destructive">
                                    <AlertDescription>
                                        余额不足。暂不支持在线充值，请联系管理员入账。
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                        </div>
                    ) : (
                        ""
                    )
                }
                confirmText="确认支付"
                disabled={short}
                isLoading={action.isPending}
                handleConfirm={() =>
                    paying &&
                    action.mutate(
                        { id: paying.id, action: "pay" },
                        {
                            onSuccess: () => {
                                toast.success("支付成功，套餐已开通");
                                setPaying(null);
                            },
                        },
                    )
                }
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
