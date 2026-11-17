import { useState } from "react";
import { useOrderAction, useOrders } from "../api/hooks";
import { Badge, Button, EmptyState, Notice, Skeleton } from "./primitives";
import {
    formatDateTime,
    formatMinor,
    formatTraffic,
    periodLabel,
} from "../lib/format";

function orderStatus(status: string, expired: boolean) {
    if (status === "paid") return { label: "已开通", tone: "success" } as const;
    if (status === "cancelled")
        return { label: "已取消", tone: "neutral" } as const;
    if (expired) return { label: "已超时", tone: "neutral" } as const;
    return { label: "待支付", tone: "warn" } as const;
}

export function OrdersPanel({ balance }: { balance: number }) {
    const orders = useOrders();
    const action = useOrderAction();
    const [confirmId, setConfirmId] = useState<string | null>(null);

    if (orders.isPending) return <Skeleton className="h-32" />;
    if (orders.isError)
        return (
            <Notice
                tone="warn"
                title="订单加载失败"
                action={
                    <Button
                        variant="secondary"
                        onClick={() => orders.refetch()}
                    >
                        重试
                    </Button>
                }
            >
                {orders.error.message}
            </Notice>
        );
    if (!orders.data.length)
        return (
            <EmptyState title="还没有订单">
                在上方选择套餐和付款周期，即可创建订单。
            </EmptyState>
        );

    return (
        <div className="space-y-3">
            <ul className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line bg-surface shadow-card">
                {orders.data.map((order) => {
                    const expired = Date.parse(order.expiresAt) <= Date.now();
                    const status = orderStatus(order.status, expired);
                    const payable = order.status === "pending" && !expired;
                    const confirming = payable && confirmId === order.id;
                    const short = balance < order.amountMinor;

                    return (
                        <li key={order.id} className="px-5 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-ink">
                                            {order.planName}
                                            <span className="ml-1.5 font-normal text-ink-muted">
                                                {periodLabel(order.period)}
                                            </span>
                                        </p>
                                        <Badge dot tone={status.tone}>
                                            {status.label}
                                        </Badge>
                                    </div>
                                    <p className="numeric mt-1 text-xs text-ink-subtle">
                                        {formatTraffic(order.transferBytes)} ·{" "}
                                        {order.durationDays} 天 ·{" "}
                                        {formatDateTime(order.createdAt)} ·{" "}
                                        {order.id.slice(0, 8)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="numeric text-sm font-medium text-ink">
                                        {formatMinor(order.amountMinor)}
                                    </span>
                                    {payable && !confirming ? (
                                        <>
                                            <Button
                                                size="sm"
                                                disabled={action.isPending}
                                                onClick={() => {
                                                    action.reset();
                                                    setConfirmId(order.id);
                                                }}
                                            >
                                                余额支付
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="quiet"
                                                disabled={action.isPending}
                                                onClick={() =>
                                                    action.mutate({
                                                        id: order.id,
                                                        action: "cancel",
                                                    })
                                                }
                                            >
                                                取消
                                            </Button>
                                        </>
                                    ) : null}
                                </div>
                            </div>

                            {confirming ? (
                                <div
                                    role="group"
                                    aria-label="确认余额支付"
                                    className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-raised px-4 py-3"
                                >
                                    <div className="text-xs">
                                        <p className="text-ink">
                                            从余额扣除{" "}
                                            <strong className="numeric font-medium">
                                                {formatMinor(order.amountMinor)}
                                            </strong>
                                            ，当前余额{" "}
                                            <span className="numeric">
                                                {formatMinor(balance)}
                                            </span>
                                        </p>
                                        {short ? (
                                            <p className="mt-1 text-danger">
                                                余额不足。暂不支持在线充值，请联系管理员入账。
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-ink-muted">
                                                支付后立即开通，不可退款。
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            busy={action.isPending}
                                            disabled={short}
                                            onClick={() =>
                                                action.mutate(
                                                    {
                                                        id: order.id,
                                                        action: "pay",
                                                    },
                                                    {
                                                        onSuccess: () =>
                                                            setConfirmId(null),
                                                    },
                                                )
                                            }
                                        >
                                            确认支付
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            disabled={action.isPending}
                                            onClick={() => setConfirmId(null)}
                                        >
                                            返回
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            {action.isError ? (
                <p role="alert" className="text-xs text-danger">
                    {action.error.message}
                </p>
            ) : null}
        </div>
    );
}
