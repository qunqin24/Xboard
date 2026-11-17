import { type ColumnDef } from "@tanstack/react-table";
import type { Order } from "@xboard/api-client";
import { CreditCard, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
                        <span className="ms-1.5 text-muted-foreground">
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
                    <RowActions
                        actions={[
                            {
                                label: "余额支付",
                                icon: CreditCard,
                                onSelect: () => setPaying(row.original),
                            },
                            "separator",
                            {
                                label: "取消订单",
                                icon: X,
                                destructive: true,
                                onSelect: () =>
                                    action.mutate(
                                        {
                                            id: row.original.id,
                                            action: "cancel",
                                        },
                                        {
                                            onSuccess: () =>
                                                toast.success("订单已取消"),
                                        },
                                    ),
                            },
                        ]}
                    />
                ) : null;
            },
            meta: { className: "w-12" },
        },
    ];

    const short = paying ? balance < paying.amountMinor : false;

    return (
        <Page
            title="我的订单"
            description="最近 50 笔订单。待支付订单保留 30 分钟，超时后需要重新下单。"
        >
            <DataTable
                data={orders.data}
                isLoading={orders.isPending}
                columns={columns}
                getRowId={(order) => order.id}
                searchPlaceholder="搜索套餐…"
                exportName="我的订单"
                emptyText="还没有订单，可以去选购套餐。"
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
                title="用余额支付"
                desc={
                    paying ? (
                        <div className="space-y-3">
                            <p>
                                从余额扣除{" "}
                                <strong className="numeric">
                                    {formatMinor(paying.amountMinor)}
                                </strong>
                                ，当前余额{" "}
                                <span className="numeric">
                                    {formatMinor(balance)}
                                </span>
                                。支付后立即开通，不可退款。
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
        </Page>
    );
}
