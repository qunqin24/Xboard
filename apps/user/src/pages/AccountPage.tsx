import { LinkSimple } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAccount, usePlans } from "../api/hooks";
import { AppShell } from "../components/AppShell";
import { OrdersPanel } from "../components/OrdersPanel";
import { PlanCard } from "../components/PlanCard";
import {
    Badge,
    Button,
    buttonClass,
    Card,
    EmptyState,
    Notice,
    PageHeader,
    SectionLabel,
    Skeleton,
} from "../components/primitives";
import { TrafficRuler } from "../components/TrafficRuler";
import {
    daysLeft,
    formatDate,
    formatMinor,
    formatTraffic,
    remainingBytes,
    sumBytes,
    usedPercent,
} from "../lib/format";

function Section({
    id,
    title,
    description,
    children,
}: {
    id: string;
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section aria-labelledby={id} className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                    id={id}
                    className="text-base font-semibold tracking-tight text-ink"
                >
                    {title}
                </h2>
                {description ? (
                    <p className="text-xs text-ink-muted">{description}</p>
                ) : null}
            </div>
            {children}
        </section>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="numeric mt-0.5 text-sm text-ink">{value}</dd>
        </div>
    );
}

export function AccountPage() {
    const account = useAccount();
    const plans = usePlans(account.isSuccess);

    if (account.isPending) {
        return (
            <AppShell>
                <div
                    className="space-y-6"
                    aria-busy="true"
                    aria-label="正在加载账户"
                >
                    <Skeleton className="h-10 w-48" />
                    <div className="grid gap-4 lg:grid-cols-3">
                        <Skeleton className="h-56 lg:col-span-2" />
                        <Skeleton className="h-56" />
                    </div>
                </div>
            </AppShell>
        );
    }

    if (account.isError) {
        return (
            <AppShell>
                <Notice
                    tone="warn"
                    title="账户信息没有加载出来"
                    action={
                        <Button
                            variant="secondary"
                            onClick={() => account.refetch()}
                        >
                            重新加载
                        </Button>
                    }
                >
                    {account.error.message}
                </Notice>
            </AppShell>
        );
    }

    const data = account.data;
    const used = sumBytes(data.uploadBytes, data.downloadBytes);
    const percent = usedPercent(used, data.transferBytes);
    const leftBytes = remainingBytes(data.transferBytes, used);
    const days = daysLeft(data.expiredAt ?? null);
    const [leftValue, leftUnit] = formatTraffic(leftBytes).split(" ");
    const expired = days !== null && days <= 0;
    const status = !data.plan
        ? ({ tone: "neutral", label: "未开通" } as const)
        : expired
          ? ({ tone: "danger", label: "已到期" } as const)
          : percent >= 100
            ? ({ tone: "danger", label: "流量已用完" } as const)
            : percent >= 90
              ? ({ tone: "warn", label: "流量即将用完" } as const)
              : ({ tone: "success", label: "正常使用中" } as const);

    return (
        <AppShell>
            <div className="space-y-10">
                <PageHeader
                    title="总览"
                    description={
                        data.plan ? (
                            <>
                                {data.plan.name}，有效期至{" "}
                                <span className="numeric text-ink">
                                    {formatDate(data.expiredAt ?? null)}
                                </span>
                                {days !== null && !expired
                                    ? `，还剩 ${days} 天`
                                    : ""}
                            </>
                        ) : (
                            "还没有开通套餐。从下方选择套餐，用余额支付即可开通。"
                        )
                    }
                    actions={
                        data.plan ? (
                            <Link
                                to="/manage"
                                className={buttonClass({
                                    variant: "secondary",
                                })}
                            >
                                <LinkSimple aria-hidden className="size-4" />
                                获取订阅链接
                            </Link>
                        ) : null
                    }
                />

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <div className="flex items-center justify-between gap-2">
                            <SectionLabel>剩余流量</SectionLabel>
                            <Badge dot tone={status.tone}>
                                {status.label}
                            </Badge>
                        </div>
                        <p className="mt-3 flex items-baseline gap-1.5">
                            <span className="numeric text-5xl font-medium tracking-tight text-ink">
                                {leftValue}
                            </span>
                            <span className="text-sm text-ink-muted">
                                {leftUnit ?? "GB"}
                            </span>
                        </p>
                        <TrafficRuler
                            used={used}
                            total={data.transferBytes}
                            percent={percent}
                        />
                        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line-subtle pt-4 sm:grid-cols-4">
                            <Metric
                                label="已用"
                                value={`${formatTraffic(used)} · ${Math.round(percent)}%`}
                            />
                            <Metric
                                label="上传"
                                value={formatTraffic(data.uploadBytes)}
                            />
                            <Metric
                                label="下载"
                                value={formatTraffic(data.downloadBytes)}
                            />
                            <Metric
                                label="周期总额"
                                value={formatTraffic(data.transferBytes)}
                            />
                        </dl>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                        <Card>
                            <SectionLabel>当前套餐</SectionLabel>
                            <p className="mt-2 text-lg font-medium text-ink">
                                {data.plan?.name ?? "未开通"}
                            </p>
                            <p className="numeric mt-1 text-xs text-ink-muted">
                                {data.speedLimitMbps
                                    ? `限速 ${data.speedLimitMbps} Mbps`
                                    : "不限速"}
                            </p>
                        </Card>
                        <Card>
                            <SectionLabel>账户余额</SectionLabel>
                            <p className="numeric mt-2 text-2xl font-medium tracking-tight text-ink">
                                {formatMinor(data.balanceMinor)}
                            </p>
                            <p className="mt-1 text-xs text-ink-muted">
                                暂不支持在线充值，请联系管理员入账。
                            </p>
                        </Card>
                    </div>
                </div>

                <Section
                    id="plans-title"
                    title={data.plan ? "套餐" : "选择套餐"}
                    description="月付 30 天 · 季付 90 天 · 年付 365 天；同套餐续费叠加时间与流量"
                >
                    {plans.isPending ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            <Skeleton className="h-72" />
                            <Skeleton className="h-72" />
                        </div>
                    ) : plans.isError ? (
                        <Notice
                            tone="warn"
                            title="套餐列表没有加载出来"
                            action={
                                <Button
                                    variant="secondary"
                                    onClick={() => plans.refetch()}
                                >
                                    重新加载
                                </Button>
                            }
                        >
                            {plans.error.message}
                        </Notice>
                    ) : plans.data.length === 0 ? (
                        <EmptyState title="目前没有在售套餐">
                            稍后再来看看，或通过工单联系管理员。
                        </EmptyState>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {plans.data.map((plan) => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    current={data.plan?.id === plan.id}
                                />
                            ))}
                        </div>
                    )}
                </Section>

                <Section
                    id="orders-title"
                    title="订单"
                    description="最近 50 笔；待支付订单保留 30 分钟"
                >
                    <OrdersPanel balance={data.balanceMinor} />
                </Section>
            </div>
        </AppShell>
    );
}
