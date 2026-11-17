import { useState } from "react";
import { useOrderAction, useOrders } from "../api/hooks";
import { Button, Notice, Skeleton } from "./primitives";
import { formatMinor, formatTraffic, periodLabel } from "../lib/format";

export function OrdersPanel({ balance }: { balance: number }) {
    const orders = useOrders();
    const action = useOrderAction();
    const [confirmId, setConfirmId] = useState<string | null>(null);

    return (
        <section aria-labelledby="orders-title" className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                    id="orders-title"
                    className="text-base font-semibold tracking-tight text-ink"
                >
                    Recent Orders · 订单记录
                </h2>
                <p className="text-xs text-ink-muted">
                    显示最近 50 笔 · 月付 30 天 / 季付 90 天 / 年付 365
                    天，同套餐续费叠加时间与流量
                </p>
            </div>

            {orders.isPending ? (
                <Skeleton className="h-32" />
            ) : orders.isError ? (
                <Notice
                    tone="warn"
                    title="订单加载失败"
                    action={
                        <Button onClick={() => orders.refetch()}>重试</Button>
                    }
                >
                    {orders.error.message}
                </Notice>
            ) : !orders.data.length ? (
                <Notice title="还没有订单">
                    选择上方套餐和付款周期即可创建订单。
                </Notice>
            ) : (
                <div className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface">
                    {orders.data.map((order) => {
                        const expired =
                            Date.parse(order.expiresAt) <= Date.now();
                        const dotClass =
                            order.status === "paid"
                                ? "bg-signal"
                                : order.status === "pending" && !expired
                                  ? "bg-warn"
                                  : "bg-ink-subtle";
                        const statusText =
                            order.status === "paid"
                                ? "已支付并开通"
                                : order.status === "cancelled"
                                  ? "已取消"
                                  : expired
                                    ? "已超时"
                                    : "待支付";

                        return (
                            <article key={order.id} className="px-5 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <span
                                            aria-hidden
                                            className={`mt-1.5 size-2 shrink-0 rounded-full ${dotClass}`}
                                        />
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-sm font-medium text-ink">
                                                    {order.planName} ·{" "}
                                                    {periodLabel(order.period)}
                                                </h3>
                                                <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                                                    {statusText}
                                                </span>
                                            </div>
                                            <p className="numeric mt-1 text-xs text-ink-muted">
                                                {formatTraffic(
                                                    order.transferBytes,
                                                )}{" "}
                                                / {order.durationDays} 天 ·{" "}
                                                {new Date(
                                                    order.createdAt,
                                                ).toLocaleString("zh-CN")}{" "}
                                                · {order.id}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="numeric text-sm font-semibold text-ink">
                                            {formatMinor(order.amountMinor)}
                                        </span>
                                        {order.status === "pending" &&
                                        confirmId !== order.id ? (
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    disabled={
                                                        expired ||
                                                        action.isPending
                                                    }
                                                    onClick={() => {
                                                        action.reset();
                                                        setConfirmId(order.id);
                                                    }}
                                                >
                                                    余额支付
                                                </Button>
                                                <Button
                                                    variant="secondary"
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
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                {order.status === "pending" &&
                                confirmId === order.id ? (
                                    <div
                                        role="group"
                                        aria-label="确认余额支付"
                                        className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 text-xs"
                                    >
                                        <div>
                                            <p className="text-ink">
                                                确认从余额扣除{" "}
                                                <strong className="numeric">
                                                    {formatMinor(
                                                        order.amountMinor,
                                                    )}
                                                </strong>
                                                ？当前余额{" "}
                                                <span className="numeric text-ink-muted">
                                                    {formatMinor(balance)}
                                                </span>
                                                。
                                            </p>
                                            {balance < order.amountMinor ? (
                                                <p className="mt-1 text-warn">
                                                    余额不足，暂未开放在线充值。
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                busy={action.isPending}
                                                disabled={
                                                    balance <
                                                        order.amountMinor ||
                                                    expired
                                                }
                                                onClick={() =>
                                                    action.mutate(
                                                        {
                                                            id: order.id,
                                                            action: "pay",
                                                        },
                                                        {
                                                            onSuccess: () =>
                                                                setConfirmId(
                                                                    null,
                                                                ),
                                                        },
                                                    )
                                                }
                                            >
                                                确认支付
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                disabled={action.isPending}
                                                onClick={() =>
                                                    setConfirmId(null)
                                                }
                                            >
                                                返回
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            )}

            {action.isError ? (
                <p role="alert" className="text-xs text-warn">
                    {action.error.message}
                </p>
            ) : null}
        </section>
    );
}
