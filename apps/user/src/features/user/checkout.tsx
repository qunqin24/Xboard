import type { Order } from "@xboard/contracts";
import { Link } from "@tanstack/react-router";
import { CircleCheck, CircleX, TimerOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAccount, useOrder, useOrderAction } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Page } from "@/components/layout/page";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
    formatDateTime,
    formatMinor,
    formatTraffic,
    periodLabel,
} from "@/lib/format";
import { OnlinePayment } from "./online-payment";
import { orderStatus } from "./status";

/** Current time, ticking every second while `active`. */
function useNow(active: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);
    return now;
}

function countdown(ms: number) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function Row({
    label,
    children,
    strong = false,
}: {
    label: string;
    children: ReactNode;
    strong?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-group">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
                className={
                    strong
                        ? "numeric text-2xl font-bold"
                        : "numeric text-end font-medium"
                }
            >
                {children}
            </dd>
        </div>
    );
}

function describe(order: Order) {
    if (order.kind === "traffic_reset") return "清零当前用量";
    const duration =
        order.period === "onetime" ? "长期有效" : `${order.durationDays} 天`;
    return `${formatTraffic(order.transferBytes)} 流量 · ${duration}`;
}

/** What the balance button does, written out on the button itself. */
function settleLabel(order: Order) {
    if (order.payableMinor > 0)
        return `余额支付 ${formatMinor(order.payableMinor)}`;
    if (order.payableMinor < 0)
        return `确认更换，退回 ${formatMinor(-order.payableMinor)}`;
    return order.replacesPlan ? "确认更换" : "确认开通";
}

function OrderSummary({ order, now }: { order: Order; now: number }) {
    const status = orderStatus(order.status, order.expiresAt, now);
    return (
        <Card>
            <CardHeader>
                <CardTitle>{order.planName}</CardTitle>
                <CardDescription>
                    {order.period ? `${periodLabel(order.period)} · ` : ""}
                    {describe(order)}
                </CardDescription>
                <CardAction>
                    <Badge variant={status.tone}>{status.label}</Badge>
                </CardAction>
            </CardHeader>
            <CardContent>
                <dl className="space-y-group text-sm">
                    <Row label="原价">{formatMinor(order.amountMinor)}</Row>
                    {order.discountMinor > 0 ? (
                        <Row label="优惠码">
                            −{formatMinor(order.discountMinor)}
                        </Row>
                    ) : null}
                    {order.replacesPlan ? (
                        <Row label="原套餐剩余价值">
                            {order.creditMinor > 0
                                ? `−${formatMinor(order.creditMinor)}`
                                : "不抵扣"}
                        </Row>
                    ) : null}
                    <Separator />
                    <Row
                        label={order.payableMinor < 0 ? "退回余额" : "应付"}
                        strong
                    >
                        {formatMinor(Math.abs(order.payableMinor))}
                    </Row>
                </dl>
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-inline text-sm text-muted-foreground">
                <span>{`下单时间 ${formatDateTime(order.createdAt)}`}</span>
                <span className="numeric">{`订单号 ${order.id.slice(0, 8)}`}</span>
            </CardFooter>
        </Card>
    );
}

function PaymentCard({ order, now }: { order: Order; now: number }) {
    const account = useAccount();
    const action = useOrderAction();
    const [cancelling, setCancelling] = useState(false);
    const balance = account.data?.balanceMinor ?? 0;
    const short = account.isSuccess && balance < order.payableMinor;
    const left = Date.parse(order.expiresAt) - now;

    return (
        <Card>
            <CardHeader>
                <CardTitle>支付</CardTitle>
                <CardDescription className="numeric">
                    {`请在 ${countdown(left)} 内完成支付，超时后订单自动失效。`}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-group">
                {order.replacesPlan ? (
                    <p className="text-sm text-muted-foreground">
                        {order.creditMinor > 0
                            ? "原套餐剩余时间已按价值折算。支付后新套餐立即生效，原套餐随即结束。"
                            : "原套餐没有可折算的剩余时间（例如长期套餐或赠送套餐），不抵扣。支付后新套餐立即生效，原套餐随即结束。"}
                    </p>
                ) : null}
                <div className="grid gap-field">
                    <span className="text-sm font-medium">账户余额</span>
                    <p className="numeric text-sm text-muted-foreground">
                        {`当前余额 ${account.isSuccess ? formatMinor(balance) : "—"}`}
                    </p>
                    {short ? (
                        <Alert variant="destructive">
                            <AlertDescription>
                                余额不足，可使用下方的在线支付，或联系管理员入账。
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <LoadingButton
                            type="button"
                            className="sm:w-fit"
                            loading={action.isPending}
                            disabled={!account.isSuccess}
                            onClick={() =>
                                action.mutate(
                                    { id: order.id, action: "pay" },
                                    {
                                        onSuccess: () =>
                                            toast.success(
                                                order.kind === "traffic_reset"
                                                    ? "流量已重置"
                                                    : "支付成功，套餐已生效",
                                            ),
                                    },
                                )
                            }
                        >
                            {settleLabel(order)}
                        </LoadingButton>
                    )}
                </div>
                <OnlinePayment order={order} />
            </CardContent>
            <CardFooter className="justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCancelling(true)}
                >
                    取消订单
                </Button>
            </CardFooter>
            <ConfirmDialog
                open={cancelling}
                onOpenChange={setCancelling}
                title="取消订单"
                desc="取消后需重新下单。"
                confirmText="取消订单"
                cancelBtnText="返回"
                destructive
                isLoading={action.isPending}
                handleConfirm={() =>
                    action.mutate(
                        { id: order.id, action: "cancel" },
                        {
                            onSuccess: () => {
                                toast.success("订单已取消");
                                setCancelling(false);
                            },
                        },
                    )
                }
            />
        </Card>
    );
}

function Outcome({ order, now }: { order: Order; now: number }) {
    const status = orderStatus(order.status, order.expiresAt, now);
    if (order.status === "paid")
        return (
            <EmptyState
                icon={CircleCheck}
                title={
                    order.kind === "traffic_reset"
                        ? "流量已重置"
                        : "支付成功，套餐已生效"
                }
                action={
                    <div className="flex flex-wrap justify-center gap-inline">
                        <Button asChild size="sm">
                            <Link to="/subscription">查看订阅</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link to="/orders">全部订单</Link>
                        </Button>
                    </div>
                }
            />
        );
    return (
        <EmptyState
            icon={status.label === "已超时" ? TimerOff : CircleX}
            title={status.label === "已超时" ? "订单已超时" : "订单已取消"}
            description="这笔订单没有扣款，可以重新选购。"
            action={
                <Button asChild variant="outline" size="sm">
                    <Link to="/plans">重新选购</Link>
                </Button>
            }
        />
    );
}

export function Checkout({ id }: { id: string }) {
    const order = useOrder(id);
    const pending = order.data?.status === "pending";
    const now = useNow(pending);
    const payable =
        order.data !== undefined &&
        orderStatus(order.data.status, order.data.expiresAt, now).payable;

    return (
        <Page
            title="收银台"
            help="待支付订单 30 分钟后自动失效。在线支付完成后，本页会自动刷新订单状态。"
            actions={
                <Button asChild variant="outline" size="sm">
                    <Link to="/orders">全部订单</Link>
                </Button>
            }
        >
            <div className="w-full max-w-2xl space-y-page">
                {order.isPending ? (
                    <>
                        <Skeleton className="h-64 rounded-xl" />
                        <Skeleton className="h-48 rounded-xl" />
                    </>
                ) : order.error || !order.data ? (
                    <ErrorState
                        error={order.error}
                        onRetry={() => order.refetch()}
                    />
                ) : (
                    <>
                        <OrderSummary order={order.data} now={now} />
                        {payable ? (
                            <PaymentCard order={order.data} now={now} />
                        ) : (
                            <Outcome order={order.data} now={now} />
                        )}
                    </>
                )}
            </div>
        </Page>
    );
}
