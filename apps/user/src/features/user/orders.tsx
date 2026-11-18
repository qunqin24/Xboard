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
import { IconBlock } from "@/components/ui/icon-block";
import { IconText } from "@/components/icon-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    formatDateTime,
    formatMinor,
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
                                : `${formatTraffic(row.original.transferBytes)} · ${row.original.durationDays} 天`}
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
                return status.payable ? (
                    <div className="flex items-center justify-end gap-inline">
                        <Button
                            size="sm"
                            onClick={() => setPaying(row.original)}
                        >
                            结算
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

    const short = paying ? balance < paying.payableMinor : false;

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
                open={paying !== null}
                onOpenChange={(open) => !open && setPaying(null)}
                title={
                    paying?.kind === "traffic_reset"
                        ? "确认重置流量"
                        : paying?.replacesPlan
                          ? "确认更换套餐"
                          : "余额支付"
                }
                desc={
                    paying ? (
                        <div className="space-y-group">
                            <p>
                                {paying.planName} · {periodLabel(paying.period)}
                            </p>
                            {paying.replacesPlan && (
                                <p>
                                    {paying.creditMinor > 0
                                        ? `原套餐剩余价值 ${formatMinor(paying.creditMinor)} 将用于结算。`
                                        : "原套餐没有可折算的剩余时间（例如长期套餐或赠送套餐），不抵扣。"}
                                    确认后，新套餐立即生效。
                                </p>
                            )}
                            {paying.discountMinor > 0 && (
                                <p>
                                    原价 {formatMinor(paying.amountMinor)}
                                    ，优惠抵扣{" "}
                                    {formatMinor(paying.discountMinor)}。
                                </p>
                            )}
                            <p>
                                {paying.payableMinor < 0
                                    ? `将退回余额 ${formatMinor(-paying.payableMinor)}。`
                                    : paying.payableMinor === 0
                                      ? "本订单无需扣款。"
                                      : `将从余额扣除 ${formatMinor(paying.payableMinor)}（当前余额 ${formatMinor(balance)}）。`}
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
                confirmText="确认结算"
                disabled={short || !account.isSuccess}
                isLoading={action.isPending}
                handleConfirm={() =>
                    paying &&
                    action.mutate(
                        { id: paying.id, action: "pay" },
                        {
                            onSuccess: () => {
                                toast.success(
                                    paying.kind === "traffic_reset"
                                        ? "流量已重置"
                                        : "订单已结算，套餐已生效",
                                );
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
