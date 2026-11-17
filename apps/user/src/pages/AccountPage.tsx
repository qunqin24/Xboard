import { useNavigate } from "@tanstack/react-router";
import { useAccount, useLogout, usePlans } from "../api/hooks";
import { AppShell } from "../components/AppShell";
import {
    Button,
    Card,
    Notice,
    SectionLabel,
    Skeleton,
} from "../components/primitives";
import { PlanCard } from "../components/PlanCard";
import { OrdersPanel } from "../components/OrdersPanel";
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

export function AccountPage() {
    const navigate = useNavigate();
    const account = useAccount();
    const plans = usePlans(account.isSuccess);
    const logout = useLogout();

    if (account.isPending) {
        return (
            <AppShell>
                <div
                    className="space-y-6"
                    aria-busy="true"
                    aria-label="正在加载账户"
                >
                    <Skeleton className="h-12 w-64" />
                    <div className="grid gap-4 lg:grid-cols-3">
                        <Skeleton className="h-48 lg:col-span-2" />
                        <Skeleton className="h-48" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Skeleton className="h-64" />
                        <Skeleton className="h-64" />
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
                        <Button onClick={() => account.refetch()}>
                            重新加载
                        </Button>
                    }
                >
                    请确认本地 API 已启动（
                    <code className="numeric">127.0.0.1:3001</code>
                    ），然后重试。
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

    return (
        <AppShell
            email={data.email}
            busy={logout.isPending}
            onLogout={async () => {
                try {
                    await logout.mutateAsync();
                    await navigate({ to: "/login" });
                } catch {
                    /* Render the mutation error below. */
                }
            }}
        >
            <div className="space-y-8">
                {logout.isError ? (
                    <p role="alert" className="text-xs text-warn">
                        {logout.error.message}
                    </p>
                ) : null}

                {/* Vercel Overview Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-ink">
                            Overview
                        </h1>
                        <p className="mt-1 text-xs text-ink-muted">
                            {data.plan ? (
                                <>
                                    订阅有效期至{" "}
                                    <span className="numeric text-ink">
                                        {formatDate(data.expiredAt ?? null)}
                                    </span>
                                    {days !== null ? (
                                        <span>
                                            （剩余{" "}
                                            <span className="numeric">
                                                {Math.max(0, days)}
                                            </span>{" "}
                                            天）
                                        </span>
                                    ) : null}
                                </>
                            ) : (
                                "尚未开通套餐 · 请从下方选择方案"
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <a
                            href="/manage"
                            className="inline-flex items-center rounded-md border border-line bg-surface-raised px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-subtle"
                        >
                            查看流量明细
                        </a>
                        <a
                            href="/manage"
                            className="inline-flex items-center rounded-md bg-ink px-3.5 py-2 text-xs font-medium text-paper transition-colors hover:bg-ink-hover"
                        >
                            导出订阅配置
                        </a>
                    </div>
                </div>

                {/* Vercel 3-Column Metrics Grid */}
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="flex flex-col justify-between lg:col-span-2">
                        <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <SectionLabel>
                                    Bandwidth Usage · 周期流量
                                </SectionLabel>
                                {data.plan ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-signal">
                                        <span className="size-1.5 rounded-full bg-signal" />
                                        正常使用中
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                                        <span className="size-1.5 rounded-full bg-ink-subtle" />
                                        未开通
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
                                <p className="flex items-baseline gap-2">
                                    <span className="numeric text-4xl font-semibold tracking-tight text-ink">
                                        {leftValue}
                                    </span>
                                    <span className="text-sm font-medium text-ink-muted">
                                        {leftUnit ?? "GB"} 剩余
                                    </span>
                                </p>
                                <p className="numeric text-xs text-ink-muted">
                                    {formatTraffic(used)} /{" "}
                                    {formatTraffic(data.transferBytes)} (
                                    {Math.round(percent)}%)
                                </p>
                            </div>
                            <TrafficRuler
                                used={used}
                                total={data.transferBytes}
                                percent={percent}
                            />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-6 border-t border-line-subtle pt-4 text-xs text-ink-muted">
                            <span>
                                上传{" "}
                                <strong className="numeric font-medium text-ink">
                                    {formatTraffic(data.uploadBytes)}
                                </strong>
                            </span>
                            <span>
                                下载{" "}
                                <strong className="numeric font-medium text-ink">
                                    {formatTraffic(data.downloadBytes)}
                                </strong>
                            </span>
                            <span>
                                总额度{" "}
                                <strong className="numeric font-medium text-ink">
                                    {formatTraffic(data.transferBytes)}
                                </strong>
                            </span>
                        </div>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                        <Card className="flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2">
                                <SectionLabel>当前套餐</SectionLabel>
                                <span className="numeric rounded border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink">
                                    {data.speedLimitMbps
                                        ? `${data.speedLimitMbps} Mbps`
                                        : "不限速"}
                                </span>
                            </div>
                            {data.plan ? (
                                <p className="mt-3 text-lg font-semibold text-ink">
                                    {data.plan.name}
                                </p>
                            ) : (
                                <p className="mt-3 text-xs text-ink-muted">
                                    尚未开通套餐，可从下方选择方案下单。
                                </p>
                            )}
                        </Card>

                        <Card className="flex flex-col justify-between">
                            <SectionLabel>可用余额</SectionLabel>
                            <div className="mt-3 flex items-baseline justify-between gap-2">
                                <span className="numeric text-2xl font-semibold text-ink">
                                    {formatMinor(data.balanceMinor)}
                                </span>
                                <span className="text-xs text-ink-muted">
                                    CNY
                                </span>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Plans Grid */}
                <section aria-labelledby="plans-title" className="space-y-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                        <h2
                            id="plans-title"
                            className="text-base font-semibold tracking-tight text-ink"
                        >
                            Plans · 可购套餐
                        </h2>
                        <p className="text-xs text-ink-muted">
                            价格为人民币，含两位小数
                        </p>
                    </div>
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
                                <Button onClick={() => plans.refetch()}>
                                    重新加载
                                </Button>
                            }
                        >
                            网络或 API 异常。账户数据不受影响。
                        </Notice>
                    ) : plans.data.length === 0 ? (
                        <Notice title="目前没有在售套餐">
                            所有套餐都已售罄或下架。稍后再试，或联系管理员确认上架计划。
                        </Notice>
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
                </section>

                <OrdersPanel balance={data.balanceMinor} />
            </div>
        </AppShell>
    );
}
