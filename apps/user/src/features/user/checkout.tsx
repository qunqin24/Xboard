import type {
    Checkout as GatewayCheckout,
    Order,
    PaymentGateway,
    Plan,
} from "@xboard/contracts";
import { couponCodeSchema } from "@xboard/contracts";
import { Link } from "@tanstack/react-router";
import {
    CalendarClock,
    Check,
    CircleCheck,
    CircleX,
    CreditCard,
    Gauge,
    HardDrive,
    LifeBuoy,
    MonitorSmartphone,
    Package,
    RotateCcw,
    ShieldCheck,
    Timer,
    Ticket,
    TimerOff,
    Wallet,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
    useAccount,
    useOrder,
    useOrderAction,
    useOrderCoupon,
    usePlans,
} from "@/api/hooks";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { IconBlock } from "@/components/ui/icon-block";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tile } from "@/components/ui/tile";
import { serverErrorMessage } from "@/lib/handle-server-error";
import {
    formatDate,
    formatDateTime,
    formatMinor,
    formatTraffic,
    periodLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { orderStatus } from "./status";

/** How long a pending order stays payable; matches the API's window. */
const PAY_WINDOW_MS = 30 * 60_000;

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

function gatewayFee(gateway: PaymentGateway, payable: number) {
    return (
        Math.ceil((payable * gateway.feePercentBasisPoints) / 10_000) +
        gateway.feeFixedMinor
    );
}

/* ------------------------------------------------------------------ */
/* Progress steps                                                      */
/* ------------------------------------------------------------------ */

const STEPS = ["选择套餐", "确认支付", "开通完成"] as const;

function Steps({ current, failed }: { current: number; failed: boolean }) {
    return (
        <ol className="flex items-center gap-inline" aria-label="购买进度">
            {STEPS.map((label, index) => {
                const done = index < current;
                const active = index === current;
                return (
                    <li
                        key={label}
                        className="flex min-w-0 flex-1 items-center gap-inline last:flex-none"
                        aria-current={active ? "step" : undefined}
                    >
                        <span
                            className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                                done &&
                                    "border-primary bg-primary text-primary-foreground",
                                active &&
                                    !failed &&
                                    "border-primary bg-primary/10 text-primary",
                                active &&
                                    failed &&
                                    "border-border bg-muted text-muted-foreground",
                                !done &&
                                    !active &&
                                    "border-border text-muted-foreground",
                            )}
                        >
                            {done ? (
                                <Check className="size-4" aria-hidden="true" />
                            ) : (
                                index + 1
                            )}
                        </span>
                        <span
                            className={cn(
                                "truncate text-sm",
                                active || done
                                    ? "font-medium"
                                    : "text-muted-foreground",
                                !active && "sr-only sm:not-sr-only",
                            )}
                        >
                            {label}
                        </span>
                        {index < STEPS.length - 1 ? (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "h-px min-w-4 flex-1",
                                    done ? "bg-primary" : "bg-border",
                                )}
                            />
                        ) : null}
                    </li>
                );
            })}
        </ol>
    );
}

/* ------------------------------------------------------------------ */
/* Order details                                                       */
/* ------------------------------------------------------------------ */

function Fact({
    icon: Icon,
    label,
    value,
    hint,
}: {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    hint?: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <IconBlock tone="neutral">
                <Icon />
            </IconBlock>
            <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="numeric truncate text-sm font-medium">
                    {value}
                </dd>
                {hint ? (
                    <dd className="truncate text-xs text-muted-foreground">
                        {hint}
                    </dd>
                ) : null}
            </div>
        </div>
    );
}

const RESET_HINT: Record<Plan["trafficResetMode"], string | null> = {
    none: "不自动重置",
    month_start: "每月 1 日重置",
    activation_day: "每月按开通日重置",
    year_start: "每年 1 月 1 日重置",
    activation_anniversary: "每年按开通日重置",
};

/** The plan behind an order, when its name points at exactly one plan. */
function useOrderPlan(order: Order): Plan | undefined {
    const plans = usePlans(order.kind !== "traffic_reset");
    const matches = plans.data?.filter((plan) => plan.name === order.planName);
    return matches?.length === 1 ? matches[0] : undefined;
}

function OrderDetails({ order, now }: { order: Order; now: number }) {
    const status = orderStatus(order.status, order.expiresAt, now);
    const plan = useOrderPlan(order);
    const reset = order.kind === "traffic_reset";
    return (
        <Card>
            <CardHeader>
                <div className="flex min-w-0 items-center gap-3">
                    <IconBlock>{reset ? <RotateCcw /> : <Package />}</IconBlock>
                    <div className="min-w-0">
                        <CardTitle className="truncate text-lg">
                            {order.planName}
                        </CardTitle>
                        <CardDescription>
                            {reset
                                ? "流量重置包"
                                : order.period
                                  ? periodLabel(order.period)
                                  : ""}
                        </CardDescription>
                    </div>
                </div>
                <CardAction>
                    <Badge variant={status.tone}>{status.label}</Badge>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-card">
                <dl className="grid grid-cols-2 gap-group">
                    {reset ? (
                        <>
                            <Fact
                                icon={RotateCcw}
                                label="内容"
                                value="清零当前已用流量"
                            />
                            <Fact
                                icon={Zap}
                                label="生效"
                                value="支付后立即生效"
                            />
                        </>
                    ) : (
                        <>
                            <Fact
                                icon={HardDrive}
                                label="流量"
                                value={formatTraffic(order.transferBytes)}
                                hint={
                                    plan
                                        ? (RESET_HINT[plan.trafficResetMode] ??
                                          undefined)
                                        : undefined
                                }
                            />
                            <Fact
                                icon={CalendarClock}
                                label="有效期"
                                value={
                                    order.period === "onetime"
                                        ? "长期有效"
                                        : `${order.durationDays} 天`
                                }
                            />
                            {plan ? (
                                <>
                                    <Fact
                                        icon={Gauge}
                                        label="限速"
                                        value={
                                            plan.speedLimitMbps
                                                ? `${plan.speedLimitMbps} Mbps`
                                                : "不限"
                                        }
                                    />
                                    <Fact
                                        icon={MonitorSmartphone}
                                        label="设备"
                                        value={
                                            plan.deviceLimit
                                                ? `${plan.deviceLimit} 台`
                                                : "不限"
                                        }
                                    />
                                </>
                            ) : null}
                        </>
                    )}
                </dl>
                {plan?.description ? (
                    <p className="text-sm text-muted-foreground">
                        {plan.description}
                    </p>
                ) : null}
                {order.replacesPlan && status.payable ? (
                    <Alert variant="info">
                        <AlertDescription>
                            {order.creditMinor > 0
                                ? "原套餐剩余时间已按价值折算。支付后新套餐立即生效，原套餐随即结束。"
                                : "原套餐没有可折算的剩余时间（例如长期套餐或赠送套餐），不抵扣。支付后新套餐立即生效，原套餐随即结束。"}
                        </AlertDescription>
                    </Alert>
                ) : null}
            </CardContent>
        </Card>
    );
}

function PriceRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-group">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="numeric text-end font-medium">{children}</dd>
        </div>
    );
}

function CouponForm({ order }: { order: Order }) {
    const coupon = useOrderCoupon(order.id);
    const [code, setCode] = useState("");
    const [invalid, setInvalid] = useState<string | null>(null);
    const error =
        invalid ?? (coupon.error ? serverErrorMessage(coupon.error) : null);
    return (
        <form
            className="space-y-field"
            onSubmit={(event) => {
                event.preventDefault();
                const parsed = couponCodeSchema.safeParse(code);
                if (!parsed.success) {
                    setInvalid(
                        parsed.error.issues[0]?.message ?? "优惠码格式不正确。",
                    );
                    return;
                }
                setInvalid(null);
                coupon.mutate(parsed.data, { onSuccess: () => setCode("") });
            }}
        >
            <div className="flex gap-inline">
                <div className="relative min-w-0 flex-1">
                    <Ticket
                        aria-hidden="true"
                        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        aria-label="优惠码"
                        placeholder="输入优惠码"
                        autoComplete="off"
                        maxLength={48}
                        className="ps-9 uppercase placeholder:normal-case"
                        value={code}
                        aria-invalid={error ? true : undefined}
                        onChange={(event) => {
                            setCode(event.target.value);
                            setInvalid(null);
                            coupon.reset();
                        }}
                    />
                </div>
                <LoadingButton
                    type="submit"
                    variant="outline"
                    loading={coupon.isPending}
                    disabled={!code.trim()}
                >
                    使用
                </LoadingButton>
            </div>
            {error ? (
                <p className="text-sm text-destructive" role="alert">
                    {error}
                </p>
            ) : null}
        </form>
    );
}

function AppliedCoupon({
    order,
    editable,
}: {
    order: Order;
    editable: boolean;
}) {
    const coupon = useOrderCoupon(order.id);
    return (
        <div className="flex items-center justify-between gap-group">
            <dt className="flex min-w-0 items-center gap-inline text-muted-foreground">
                <Ticket className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">
                    {order.couponCode ? `优惠码 ${order.couponCode}` : "优惠码"}
                </span>
                {editable ? (
                    <LoadingButton
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        loading={coupon.isPending}
                        onClick={() => coupon.mutate(null)}
                    >
                        移除
                    </LoadingButton>
                ) : null}
            </dt>
            <dd className="numeric text-end font-medium text-success">
                −{formatMinor(order.discountMinor)}
            </dd>
        </div>
    );
}

function Breakdown({ order, editable }: { order: Order; editable: boolean }) {
    // Coupons apply to plan purchases, not traffic reset packs.
    const couponable = editable && order.kind === "subscription";
    return (
        <Card>
            <CardHeader>
                <CardTitle>费用明细</CardTitle>
            </CardHeader>
            <CardContent className="space-y-group">
                <dl className="space-y-group text-sm">
                    <PriceRow label="原价">
                        {formatMinor(order.amountMinor)}
                    </PriceRow>
                    {order.replacesPlan ? (
                        <PriceRow label="原套餐剩余价值">
                            {order.creditMinor > 0 ? (
                                <span className="text-success">
                                    −{formatMinor(order.creditMinor)}
                                </span>
                            ) : (
                                "不抵扣"
                            )}
                        </PriceRow>
                    ) : null}
                    {order.discountMinor > 0 ? (
                        <AppliedCoupon order={order} editable={couponable} />
                    ) : null}
                </dl>
                {couponable &&
                order.discountMinor === 0 &&
                order.payableMinor > 0 ? (
                    <CouponForm order={order} />
                ) : null}
                <dl className="space-y-group text-sm">
                    <div
                        aria-hidden="true"
                        className="border-t border-dashed"
                    />
                    <div className="flex items-baseline justify-between gap-group">
                        <dt className="font-medium">
                            {order.payableMinor < 0 ? "退回余额" : "应付"}
                        </dt>
                        <dd className="numeric text-3xl font-bold text-primary">
                            {formatMinor(Math.abs(order.payableMinor))}
                        </dd>
                    </div>
                </dl>
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-inline border-t text-xs text-muted-foreground">
                <span className="numeric">
                    {`下单时间 ${formatDateTime(order.createdAt)}`}
                </span>
                <span
                    className="numeric"
                    title={order.id}
                >{`订单号 ${order.id.slice(0, 8)}`}</span>
            </CardFooter>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Payment                                                             */
/* ------------------------------------------------------------------ */

function Countdown({ left }: { left: number }) {
    const percent = (left / PAY_WINDOW_MS) * 100;
    const urgent = left < 5 * 60_000;
    return (
        <div className="space-y-field">
            <div className="flex items-center justify-between gap-group">
                <span className="flex items-center gap-inline text-sm text-muted-foreground">
                    <Timer className="size-4" aria-hidden="true" />
                    剩余支付时间
                </span>
                <span
                    className={cn(
                        "numeric text-2xl font-semibold",
                        urgent && "text-warning",
                    )}
                    role="timer"
                >
                    {countdown(left)}
                </span>
            </div>
            <Progress value={percent} tone={urgent ? "warning" : "default"} />
        </div>
    );
}

function MethodTile({
    value,
    icon,
    title,
    detail,
    amount,
    disabled = false,
    selected,
}: {
    value: string;
    icon: ReactNode;
    title: string;
    detail: string;
    amount?: string;
    disabled?: boolean;
    selected: boolean;
}) {
    const id = `method-${value}`;
    return (
        <Tile
            tone={selected ? "highlight" : "default"}
            className={cn(
                "relative",
                disabled ? "opacity-60" : "cursor-pointer hover:bg-accent/50",
            )}
        >
            <RadioGroupItem
                value={value}
                id={id}
                disabled={disabled}
                className="shrink-0"
            />
            {icon}
            <label
                htmlFor={id}
                className={cn(
                    "min-w-0 flex-1 after:absolute after:inset-0",
                    !disabled && "cursor-pointer",
                )}
            >
                <span className="block truncate text-sm font-medium">
                    {title}
                </span>
                <span className="numeric block truncate text-xs text-muted-foreground">
                    {detail}
                </span>
            </label>
            {amount ? (
                <span className="numeric text-sm font-medium">{amount}</span>
            ) : null}
        </Tile>
    );
}

function confirmText(order: Order) {
    if (order.kind === "traffic_reset")
        return `将从余额扣除 ${formatMinor(order.payableMinor)}，当前套餐的已用流量立即清零。`;
    if (order.payableMinor < 0)
        return `将退回余额 ${formatMinor(-order.payableMinor)}，新套餐立即生效。`;
    if (order.payableMinor === 0) return "本订单无需扣款，确认后套餐立即生效。";
    return `将从余额扣除 ${formatMinor(order.payableMinor)}，支付后套餐立即生效。`;
}

function payLabel(order: Order, total: number) {
    if (order.payableMinor > 0) return `确认支付 ${formatMinor(total)}`;
    if (order.payableMinor < 0) return "确认更换";
    return order.replacesPlan ? "确认更换" : "确认开通";
}

function PaymentCard({ order, now }: { order: Order; now: number }) {
    const account = useAccount();
    const action = useOrderAction();
    const gateways = usePanel<PaymentGateway[]>("/payments/gateways", {
        enabled: order.payableMinor > 0,
    });
    const checkout = useCommand<GatewayCheckout>({ inline: true });
    const requests = useRef(new Map<number, string>());
    const [choice, setChoice] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const balance = account.data?.balanceMinor ?? 0;
    const charge = order.payableMinor > 0;
    const short = account.isSuccess && balance < order.payableMinor;
    const online = charge ? (gateways.data ?? []) : [];
    // Default to the balance when it covers the order, else the first gateway.
    const method =
        choice ?? (short && online[0] ? `gateway:${online[0].id}` : "balance");
    const gateway = method.startsWith("gateway:")
        ? online.find((g) => `gateway:${g.id}` === method)
        : undefined;
    const fee = gateway ? gatewayFee(gateway, order.payableMinor) : 0;
    const total = Math.max(0, order.payableMinor) + fee;
    const left = Date.parse(order.expiresAt) - now;
    const blocked = !gateway && (short || !account.isSuccess);

    function pay() {
        if (!gateway) {
            setConfirming(true);
            return;
        }
        const requestId =
            requests.current.get(gateway.id) ?? crypto.randomUUID();
        requests.current.set(gateway.id, requestId);
        checkout.mutate(
            {
                path: `/orders/${order.id}/checkout`,
                body: { gatewayId: gateway.id, requestId },
            },
            { onSuccess: (result) => window.location.assign(result.url) },
        );
    }

    return (
        <Card className="lg:sticky lg:top-20">
            <CardHeader>
                <CardTitle>支付</CardTitle>
            </CardHeader>
            <CardContent className="space-y-card">
                <Countdown left={left} />
                {charge ? (
                    <div className="space-y-field">
                        <span className="text-sm font-medium">支付方式</span>
                        <RadioGroup
                            value={method}
                            onValueChange={setChoice}
                            className="gap-field"
                            aria-label="支付方式"
                        >
                            <MethodTile
                                value="balance"
                                selected={method === "balance"}
                                disabled={short}
                                icon={
                                    <IconBlock size="sm">
                                        <Wallet />
                                    </IconBlock>
                                }
                                title="账户余额"
                                detail={
                                    account.isSuccess
                                        ? short
                                            ? `余额不足，当前 ${formatMinor(balance)}`
                                            : `可用 ${formatMinor(balance)}`
                                        : "—"
                                }
                            />
                            {gateways.isPending ? (
                                <Skeleton className="h-16 rounded-surface" />
                            ) : null}
                            {online.map((item) => {
                                const itemFee = gatewayFee(
                                    item,
                                    order.payableMinor,
                                );
                                return (
                                    <MethodTile
                                        key={item.id}
                                        value={`gateway:${item.id}`}
                                        selected={
                                            method === `gateway:${item.id}`
                                        }
                                        icon={
                                            item.icon ? (
                                                <img
                                                    src={item.icon}
                                                    alt=""
                                                    className="size-8 shrink-0 rounded-control object-contain"
                                                />
                                            ) : (
                                                <IconBlock
                                                    size="sm"
                                                    tone="neutral"
                                                >
                                                    <CreditCard />
                                                </IconBlock>
                                            )
                                        }
                                        title={item.name}
                                        detail={
                                            itemFee > 0
                                                ? `手续费 ${formatMinor(itemFee)}`
                                                : "无手续费"
                                        }
                                        amount={formatMinor(
                                            order.payableMinor + itemFee,
                                        )}
                                    />
                                );
                            })}
                        </RadioGroup>
                        {short && online.length === 0 && gateways.isSuccess ? (
                            <Alert variant="warning">
                                <AlertDescription>
                                    余额不足，且暂无可用的在线支付方式。请联系管理员入账后再支付。
                                </AlertDescription>
                            </Alert>
                        ) : null}
                    </div>
                ) : (
                    <Tile tone="highlight">
                        <IconBlock size="sm">
                            <Wallet />
                        </IconBlock>
                        <div className="min-w-0 flex-1 text-sm">
                            {order.payableMinor < 0
                                ? `抵扣后有剩余，${formatMinor(-order.payableMinor)} 将退回余额。`
                                : "抵扣后无需付款。"}
                        </div>
                    </Tile>
                )}
                {charge ? (
                    <div className="flex items-baseline justify-between gap-group border-t pt-card">
                        <span className="text-sm text-muted-foreground">
                            实付
                        </span>
                        <span className="numeric text-2xl font-bold">
                            {formatMinor(total)}
                        </span>
                    </div>
                ) : null}
                <LoadingButton
                    type="button"
                    size="lg"
                    className="w-full"
                    loading={checkout.isPending}
                    disabled={blocked}
                    onClick={pay}
                >
                    {payLabel(order, total)}
                </LoadingButton>
                {checkout.error ? (
                    <p className="text-sm text-destructive" role="alert">
                        {serverErrorMessage(checkout.error)}
                    </p>
                ) : null}
                <ul className="space-y-field text-xs text-muted-foreground">
                    <li className="flex items-center gap-inline">
                        <ShieldCheck className="size-4 shrink-0" />
                        金额以本页为准，在线支付完成后自动开通。
                    </li>
                    <li className="flex items-center gap-inline">
                        <Zap className="size-4 shrink-0" />
                        支付成功后立即生效，无需等待人工处理。
                    </li>
                    <li className="flex items-center gap-inline">
                        <LifeBuoy className="size-4 shrink-0" />
                        <span>
                            支付遇到问题？
                            <Link
                                to="/tickets"
                                className="ms-1 font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                提交工单
                            </Link>
                        </span>
                    </li>
                </ul>
            </CardContent>
            <CardFooter className="justify-center border-t">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setCancelling(true)}
                >
                    取消订单
                </Button>
            </CardFooter>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={
                    order.kind === "traffic_reset"
                        ? "确认重置流量"
                        : order.replacesPlan
                          ? "确认更换套餐"
                          : "确认支付"
                }
                desc={
                    <div className="space-y-field">
                        <p>
                            {order.planName}
                            {order.period
                                ? ` · ${periodLabel(order.period)}`
                                : ""}
                        </p>
                        <p>{confirmText(order)}</p>
                    </div>
                }
                confirmText={
                    order.payableMinor > 0
                        ? `支付 ${formatMinor(order.payableMinor)}`
                        : "确认"
                }
                isLoading={action.isPending}
                handleConfirm={() =>
                    action.mutate(
                        { id: order.id, action: "pay" },
                        {
                            onSuccess: () => {
                                setConfirming(false);
                                toast.success(
                                    order.kind === "traffic_reset"
                                        ? "流量已重置"
                                        : "支付成功，套餐已生效",
                                );
                            },
                        },
                    )
                }
            />
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

/* ------------------------------------------------------------------ */
/* Finished orders                                                     */
/* ------------------------------------------------------------------ */

function Outcome({ order, now }: { order: Order; now: number }) {
    const account = useAccount();
    const paid = order.status === "paid";
    const timedOut =
        !paid &&
        orderStatus(order.status, order.expiresAt, now).label === "已超时";
    const Icon = paid ? CircleCheck : timedOut ? TimerOff : CircleX;
    return (
        <Card
            className={cn(
                "lg:sticky lg:top-20",
                paid && "border-success/30 bg-success/5",
            )}
        >
            <CardContent className="flex flex-col items-center gap-group py-card text-center">
                <span
                    className={cn(
                        "flex size-16 items-center justify-center rounded-full",
                        paid
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground",
                    )}
                >
                    <Icon className="size-8" aria-hidden="true" />
                </span>
                <div className="space-y-field">
                    <p className="text-lg font-semibold">
                        {paid
                            ? order.kind === "traffic_reset"
                                ? "流量已重置"
                                : "支付成功，套餐已生效"
                            : timedOut
                              ? "订单已超时"
                              : "订单已取消"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {paid
                            ? account.data?.plan
                                ? `当前套餐 ${account.data.plan.name} · 到期时间 ${formatDate(account.data.expiredAt)}`
                                : ""
                            : "这笔订单没有扣款，可以重新选购。"}
                    </p>
                </div>
                <div className="flex w-full flex-col gap-inline">
                    {paid ? (
                        <>
                            <Button asChild>
                                <Link to="/subscription">查看订阅</Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link to="/">返回总览</Link>
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button asChild>
                                <Link to="/plans">重新选购</Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link to="/orders">全部订单</Link>
                            </Button>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function Checkout({ id }: { id: string }) {
    const order = useOrder(id);
    const pending = order.data?.status === "pending";
    const now = useNow(pending);
    const status = order.data
        ? orderStatus(order.data.status, order.data.expiresAt, now)
        : undefined;
    const step = order.data?.status === "paid" ? 3 : 1;

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
            <div className="w-full space-y-page">
                <Card className="py-group">
                    <CardContent className="px-card">
                        <Steps
                            current={step}
                            failed={
                                status !== undefined &&
                                !status.payable &&
                                step !== 3
                            }
                        />
                    </CardContent>
                </Card>
                {order.isPending ? (
                    <div className="grid items-start gap-page lg:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="space-y-page">
                            <Skeleton className="h-72 rounded-card" />
                            <Skeleton className="h-56 rounded-card" />
                        </div>
                        <Skeleton className="h-96 rounded-card" />
                    </div>
                ) : order.error || !order.data || !status ? (
                    <ErrorState
                        error={order.error}
                        onRetry={() => order.refetch()}
                    />
                ) : (
                    <div className="grid items-start gap-page lg:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="space-y-page">
                            <OrderDetails order={order.data} now={now} />
                            <Breakdown
                                order={order.data}
                                editable={status.payable}
                            />
                        </div>
                        {status.payable ? (
                            <PaymentCard order={order.data} now={now} />
                        ) : (
                            <Outcome order={order.data} now={now} />
                        )}
                    </div>
                )}
            </div>
        </Page>
    );
}
