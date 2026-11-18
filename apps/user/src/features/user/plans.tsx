import { Link, useNavigate } from "@tanstack/react-router";
import type { Plan } from "@xboard/contracts";
import { Check, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useCreateOrder, usePlans } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { InfoTip } from "@/components/info-tip";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    daysLeft,
    formatMinor,
    formatTraffic,
    periodLabel,
} from "@/lib/format";

type Period = "monthly" | "quarterly" | "yearly";

function PlanCard({
    plan,
    current,
    locked,
}: {
    plan: Plan;
    current: boolean;
    /** The user holds another plan that is still valid, so only renewal is allowed. */
    locked: boolean;
}) {
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
                            requestId.current = null;
                        }}
                        className="w-full"
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
                        `每周期 ${formatTraffic(plan.transferBytes)} 流量`,
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
                    disabled={!price || create.isPending || locked}
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
                {locked ? (
                    <InfoTip label="无法购买的原因">
                        有效期内仅可续费当前套餐
                    </InfoTip>
                ) : null}
            </CardFooter>
        </Card>
    );
}

export function Plans() {
    const account = useAccount();
    const plans = usePlans(account.isSuccess);
    const currentId = account.data?.plan?.id;
    const expiry = daysLeft(account.data?.expiredAt ?? null);
    const hasActivePlan =
        currentId !== undefined && (expiry === null || expiry > 0);

    return (
        <Page
            title="选购套餐"
            help={
                <>
                    月付 30 天、季付 90 天、年付 365 天。
                    有效期内仅可续费当前套餐，续费后时长与流量累加。
                </>
            }
        >
            {account.isError || plans.isError ? (
                <ErrorState
                    error={account.error ?? plans.error}
                    onRetry={() => {
                        if (account.isError) void account.refetch();
                        if (plans.isError) void plans.refetch();
                    }}
                />
            ) : plans.isPending ? (
                <div className="grid gap-group md:grid-cols-2 xl:grid-cols-3">
                    <Skeleton className="h-96" />
                    <Skeleton className="h-96" />
                </div>
            ) : plans.data?.length ? (
                <div className="grid gap-group md:grid-cols-2 xl:grid-cols-3">
                    {plans.data.map((plan) => (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            current={currentId === plan.id}
                            locked={hasActivePlan && currentId !== plan.id}
                        />
                    ))}
                </div>
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
