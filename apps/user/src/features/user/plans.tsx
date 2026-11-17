import { useNavigate } from "@tanstack/react-router";
import type { Plan } from "@xboard/api-client";
import { Check, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useCreateOrder, usePlans } from "@/api/hooks";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMinor, formatTraffic, periodLabel } from "@/lib/format";

type Period = "monthly" | "quarterly" | "yearly";

function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
    const navigate = useNavigate();
    const create = useCreateOrder();
    const [period, setPeriod] = useState<Period>(
        (plan.prices[0]?.period as Period) ?? "monthly",
    );
    // One request id per period choice, so a double click never makes two orders.
    const requestId = useRef<string | null>(null);
    const price =
        plan.prices.find((p) => p.period === period) ?? plan.prices[0];

    return (
        <Card className={current ? "border-primary" : undefined}>
            <CardHeader>
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {current ? <Badge>当前套餐</Badge> : null}
                </div>
                {plan.description ? (
                    <CardDescription>{plan.description}</CardDescription>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-5">
                <p className="flex items-baseline gap-1.5">
                    <span className="numeric text-3xl font-bold">
                        {price ? formatMinor(price.amountMinor) : "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        / {price ? periodLabel(price.period) : ""}
                    </span>
                </p>
                {plan.prices.length > 1 ? (
                    <Tabs
                        value={period}
                        onValueChange={(value) => {
                            setPeriod(value as Period);
                            requestId.current = null;
                        }}
                    >
                        <TabsList className="w-full">
                            {plan.prices.map((p) => (
                                <TabsTrigger key={p.period} value={p.period}>
                                    {periodLabel(p.period)}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                ) : null}
                <ul className="space-y-2 text-sm">
                    {[
                        `每周期 ${formatTraffic(plan.transferBytes)} 流量`,
                        plan.speedLimitMbps
                            ? `峰值 ${plan.speedLimitMbps} Mbps`
                            : "不限速",
                        plan.deviceLimit
                            ? `最多 ${plan.deviceLimit} 台设备在线`
                            : "设备数不限",
                    ].map((line) => (
                        <li key={line} className="flex items-center gap-2">
                            <Check className="size-4 text-muted-foreground" />
                            {line}
                        </li>
                    ))}
                </ul>
            </CardContent>
            <CardFooter className="mt-auto flex-col items-stretch gap-2">
                <Button
                    variant={current ? "default" : "outline"}
                    disabled={!price || create.isPending}
                    onClick={() => {
                        requestId.current ??= crypto.randomUUID();
                        create.mutate(
                            {
                                planId: plan.id,
                                period,
                                requestId: requestId.current,
                            },
                            {
                                onSuccess: () => {
                                    requestId.current = null;
                                    toast.success(
                                        "订单已创建，请在 30 分钟内完成支付。",
                                    );
                                    void navigate({ to: "/orders" });
                                },
                            },
                        );
                    }}
                >
                    {create.isPending ? (
                        <Loader2 className="animate-spin" />
                    ) : null}
                    {current ? "续费" : "购买"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                    先创建订单，确认后再从余额扣款。
                </p>
            </CardFooter>
        </Card>
    );
}

export function Plans() {
    const account = useAccount();
    const plans = usePlans(account.isSuccess);

    return (
        <Page
            title="选购套餐"
            description="月付 30 天、季付 90 天、年付 365 天。有效期内只能续费同一套餐，续费叠加时间与流量。"
        >
            {plans.isPending ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Skeleton className="h-96" />
                    <Skeleton className="h-96" />
                </div>
            ) : plans.data?.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {plans.data.map((plan) => (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            current={account.data?.plan?.id === plan.id}
                        />
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        目前没有在售套餐，稍后再来看看，或通过工单联系管理员。
                    </CardContent>
                </Card>
            )}
        </Page>
    );
}
