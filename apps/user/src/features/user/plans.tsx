import { Link, useNavigate } from "@tanstack/react-router";
import {
    couponCodeSchema,
    type CreateOrderBody,
    type Period,
    type Plan,
} from "@xboard/contracts";
import { Check, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useCreateOrder, usePlans } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Page } from "@/components/layout/page";
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
import { Skeleton } from "@/components/ui/skeleton";
import { LoadAnnouncement } from "@/components/load-announcement";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    formatDateTime,
    formatMinor,
    formatTraffic,
    periodLabel,
} from "@/lib/format";
import { RedeemGift } from "./redeem-gift";

function useOrderCheckout() {
    const navigate = useNavigate();
    const create = useCreateOrder();
    const previous = useRef<{ key: string; id: string } | null>(null);
    function submit(
        input:
            | Omit<
                  Extract<CreateOrderBody, { kind?: "subscription" }>,
                  "requestId"
              >
            | Omit<
                  Extract<CreateOrderBody, { kind: "traffic_reset" }>,
                  "requestId"
              >,
    ) {
        const key = JSON.stringify(input);
        if (previous.current?.key !== key)
            previous.current = { key, id: crypto.randomUUID() };
        create.mutate(
            { ...input, requestId: previous.current.id },
            {
                onSuccess: () => {
                    previous.current = null;
                    toast.success("订单已创建，请在 30 分钟内确认结算。");
                    void navigate({ to: "/orders" });
                },
            },
        );
    }
    return { submit, pending: create.isPending };
}

function PlanCard({
    plan,
    current,
    switching,
    permanent,
    couponCode,
}: {
    plan: Plan;
    current: boolean;
    switching: boolean;
    permanent: boolean;
    couponCode: string;
}) {
    const checkout = useOrderCheckout();
    const [period, setPeriod] = useState<Period>(
        plan.prices[0]?.period ?? "monthly",
    );
    const price =
        plan.prices.find((p) => p.period === period) ?? plan.prices[0];

    const quotaPeriod = {
        none: price?.period === "onetime" ? "总计" : "每周期",
        month_start: "每月",
        activation_day: "每月",
        year_start: "每年",
        activation_anniversary: "每年",
    }[plan.trafficResetMode];
    return (
        <Card className={current ? "border-primary" : undefined}>
            <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                {current ? (
                    <CardAction>
                        <Badge variant="secondary">当前套餐</Badge>
                    </CardAction>
                ) : null}
                {plan.description ? (
                    <CardDescription>{plan.description}</CardDescription>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-group">
                <p className="flex items-baseline gap-1">
                    <span className="numeric text-3xl font-bold">
                        {price ? formatMinor(price.amountMinor) : "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        / {price ? periodLabel(price.period) : ""}
                    </span>
                </p>
                {plan.prices.length > 1 ? (
                    <ToggleGroup
                        type="single"
                        value={period}
                        onValueChange={(value) => {
                            if (!value) return;
                            setPeriod(value as Period);
                        }}
                        className="w-full flex-wrap justify-start"
                        aria-label="付款周期"
                    >
                        {plan.prices.map((p) => (
                            <ToggleGroupItem key={p.period} value={p.period}>
                                {periodLabel(p.period)}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                ) : null}
                <ul className="space-y-field text-sm">
                    {[
                        `${quotaPeriod} ${formatTraffic(plan.transferBytes)} 流量`,
                        plan.speedLimitMbps
                            ? `峰值 ${plan.speedLimitMbps} Mbps`
                            : "不限速",
                        plan.deviceLimit
                            ? `最多 ${plan.deviceLimit} 台设备在线`
                            : "不限设备数",
                    ].map((line) => (
                        <li key={line} className="flex items-center gap-inline">
                            <Check className="size-4 text-muted-foreground" />
                            {line}
                        </li>
                    ))}
                </ul>
            </CardContent>
            <CardFooter className="mt-auto gap-inline">
                <Button
                    className="flex-1"
                    disabled={!price || checkout.pending || permanent}
                    onClick={() => {
                        if (!price) return;
                        const coupon = couponCode
                            ? couponCodeSchema.safeParse(couponCode)
                            : null;
                        if (coupon && !coupon.success) {
                            toast.error(
                                coupon.error.issues[0]?.message ??
                                    "优惠码格式不正确。",
                            );
                            return;
                        }
                        checkout.submit({
                            planId: plan.id,
                            period: price.period,
                            ...(coupon?.success && { couponCode: coupon.data }),
                        });
                    }}
                >
                    {checkout.pending
                        ? "创建订单中…"
                        : permanent
                          ? "已有长期套餐"
                          : switching
                            ? "更换套餐"
                            : current
                              ? price?.period === "onetime"
                                  ? "转为长期"
                                  : "续费"
                              : "购买"}
                </Button>
            </CardFooter>
        </Card>
    );
}

export function Plans() {
    const account = useAccount();
    const plans = usePlans(account.isSuccess);
    const checkout = useOrderCheckout();
    const [couponCode, setCouponCode] = useState("");
    const currentId = account.data?.plan?.id;
    const expiry = account.data?.expiredAt ?? null;
    const hasActivePlan =
        currentId !== undefined &&
        (expiry === null || expiry * 1000 > Date.now());
    const resetPrice = account.data?.plan?.trafficResetPriceMinor ?? null;
    const nextReset = account.data?.nextTrafficResetAt;

    return (
        <Page
            title="选购套餐"
            actions={<RedeemGift />}
            help={
                <>
                    月付 30 天、季付 90 天、半年付 180 天、年付 365 天、两年付
                    730 天、三年付 1095 天。一次性套餐长期有效。
                    更换套餐时，按剩余时间折算已购买的权益。抵扣后的差额将从余额扣除或退回余额。
                </>
            }
        >
            <LoadAnnouncement
                loading={plans.isPending && !account.isError}
                failed={account.isError || plans.isError}
            />
            {hasActivePlan &&
                (resetPrice !== null ||
                    (nextReset &&
                        (expiry === null ||
                            Date.parse(nextReset) < expiry * 1000))) && (
                    <Card>
                        <CardHeader>
                            <CardTitle>流量重置</CardTitle>
                            <CardDescription>
                                {nextReset &&
                                (expiry === null ||
                                    Date.parse(nextReset) < expiry * 1000)
                                    ? `下次自动重置时间为 ${formatDateTime(nextReset)}（北京时间）。`
                                    : "购买重置包可清零当前套餐的已用流量。"}
                            </CardDescription>
                        </CardHeader>
                        {resetPrice !== null && currentId !== undefined && (
                            <CardFooter>
                                <Button
                                    variant="outline"
                                    disabled={checkout.pending}
                                    onClick={() =>
                                        checkout.submit({
                                            planId: currentId,
                                            kind: "traffic_reset",
                                        })
                                    }
                                >
                                    <RotateCcw /> 购买重置包{" "}
                                    {formatMinor(resetPrice)}
                                </Button>
                            </CardFooter>
                        )}
                    </Card>
                )}
            {account.isError || plans.isError ? (
                <ErrorState
                    error={account.error ?? plans.error}
                    onRetry={() =>
                        Promise.all([
                            account.isError ? account.refetch() : undefined,
                            plans.isError ? plans.refetch() : undefined,
                        ])
                    }
                />
            ) : plans.isPending ? (
                <div className="grid gap-group md:grid-cols-2 xl:grid-cols-3">
                    <Skeleton className="h-96" />
                    <Skeleton className="h-96" />
                </div>
            ) : plans.data?.length ? (
                <>
                    <div className="flex flex-wrap items-center gap-inline">
                        <Label htmlFor="plan-coupon">优惠码</Label>
                        <Input
                            id="plan-coupon"
                            autoComplete="off"
                            className="w-48 max-w-full"
                            value={couponCode}
                            maxLength={48}
                            onChange={(event) =>
                                setCouponCode(event.target.value)
                            }
                        />
                    </div>
                    <div className="grid gap-group md:grid-cols-2 xl:grid-cols-3">
                        {plans.data.map((plan) => (
                            <PlanCard
                                key={plan.id}
                                plan={plan}
                                current={hasActivePlan && currentId === plan.id}
                                switching={
                                    hasActivePlan && currentId !== plan.id
                                }
                                permanent={
                                    hasActivePlan &&
                                    expiry === null &&
                                    currentId === plan.id
                                }
                                couponCode={couponCode.trim()}
                            />
                        ))}
                    </div>
                </>
            ) : (
                <Card>
                    <EmptyState
                        title="暂无在售套餐"
                        description="如需开通，请提交工单联系管理员。"
                        action={
                            <Button asChild variant="outline" size="sm">
                                <Link to="/tickets">提交工单</Link>
                            </Button>
                        }
                    />
                </Card>
            )}
        </Page>
    );
}
