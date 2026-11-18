import { Link } from "@tanstack/react-router";
import {
    ArrowDownRight,
    ArrowUpRight,
    CreditCard,
    Gauge,
    Network,
    Receipt,
    Users,
} from "lucide-react";
import { useId, useState } from "react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { usePanel } from "@/api/panel";
import { chartAxis, chartMargin, chartTooltip } from "@/components/chart-style";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { IconBlock } from "@/components/ui/icon-block";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { Tile } from "@/components/ui/tile";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDateTime, formatMinor, formatTraffic } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
    NodeRow,
    OrderRow,
    Overview,
    Paged,
    Stats,
    StatsDay,
} from "./types";
import { PROTOCOL_LABEL } from "./node-options";
import { NODE_STATE_TONE, ORDER_STATUS } from "./status";
import { GIB, nodeState } from "./units";
import { TrafficRankings } from "./traffic-rankings";

const RANGES = [7, 30, 90] as const;
const sum = (days: StatsDay[], pick: (day: StatsDay) => number) =>
    days.reduce((t, d) => t + pick(d), 0);

/** Percentage change, or null when there is no previous value to compare. */
export function percentChange(
    current: number,
    previous: number,
): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

function Change({
    change,
    decreaseIsBad = true,
}: {
    change: number | null;
    decreaseIsBad?: boolean;
}) {
    if (change === null)
        return <p className="text-xs text-muted-foreground">上期无数据</p>;
    return (
        <p className="flex flex-wrap items-center gap-inline text-xs text-muted-foreground">
            <span
                className={cn(
                    "numeric inline-flex items-center",
                    change > 0 && "text-success",
                    change < 0 && decreaseIsBad && "text-destructive",
                )}
            >
                {change > 0 && <ArrowUpRight className="size-3" />}
                {change < 0 && <ArrowDownRight className="size-3" />}
                {change > 0 ? "+" : ""}
                {change.toFixed(change === 0 ? 0 : 1)}%
            </span>
            较上期
        </p>
    );
}

function Metric({
    title,
    icon: Icon,
    value,
    current,
    previous,
    decreaseIsBad = true,
}: {
    title: string;
    icon: React.ElementType;
    value: string;
    current: number;
    previous: number;
    /** Traffic falling is not a problem; revenue, orders and sign-ups falling is. */
    decreaseIsBad?: boolean;
}) {
    return (
        <Tile className="flex items-start gap-group">
            <IconBlock>
                <Icon />
            </IconBlock>
            <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="numeric text-xl font-semibold break-words">
                    {value}
                </p>
                <Change
                    change={percentChange(current, previous)}
                    decreaseIsBad={decreaseIsBad}
                />
            </div>
        </Tile>
    );
}

export function AdminDashboard() {
    const [range, setRange] = useState<(typeof RANGES)[number]>(30);
    const revenueGradient = useId();
    // Twice the range: the older half is the comparison period. Top plans
    // cover only the selected range.
    const stats = usePanel<Stats>(
        `/admin/stats?days=${range * 2}&topDays=${range}`,
        { keepPrevious: true },
    );
    // Switching the range keeps the old numbers, dimmed, until the new ones arrive.
    const refreshing = useDelayedFlag(stats.isPlaceholderData);
    const overview = usePanel<Overview>("/admin/overview");
    const nodes = usePanel<NodeRow[]>("/admin/nodes");
    const orders = usePanel<Paged<OrderRow>>("/admin/orders?pageSize=6");

    const all = stats.data?.days ?? [];
    const current = all.slice(-range);
    const previous = all.slice(0, Math.max(0, all.length - range));
    const kpi = (pick: (d: StatsDay) => number) =>
        [sum(current, pick), sum(previous, pick)] as const;
    const revenue = kpi((d) => d.revenueMinor);
    const paid = kpi((d) => d.paidOrders);
    const users = kpi((d) => d.newUsers);
    const traffic = kpi((d) => Number(d.trafficBytes));
    const series = current.map((d) => ({
        date: d.date.slice(5),
        revenue: d.revenueMinor / 100,
        users: d.newUsers,
        traffic: Number(d.trafficBytes) / GIB,
    }));
    const online = nodes.data?.filter((n) => nodeState(n) === "在线").length;
    const topMax = Math.max(
        1,
        ...(stats.data?.topPlans.map((p) => p.revenueMinor) ?? []),
    );

    /** Skeleton while the stats load; the error state is handled above. */
    const chart = (height: number, content: React.ReactNode) =>
        stats.isPending ? (
            <Skeleton style={{ height }} />
        ) : (
            <div
                aria-busy={refreshing}
                className={cn(
                    "transition-opacity duration-200",
                    refreshing && "opacity-60",
                )}
            >
                {content}
            </div>
        );

    return (
        <Page
            title="仪表盘"
            actions={
                <ToggleGroup
                    type="single"
                    value={String(range)}
                    onValueChange={(v) =>
                        v && setRange(Number(v) as (typeof RANGES)[number])
                    }
                    aria-label="时间范围"
                >
                    {RANGES.map((days) => (
                        <ToggleGroupItem key={days} value={String(days)}>
                            近 {days} 天
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            }
        >
            <div className="flex flex-wrap items-center gap-x-group gap-y-field text-sm text-muted-foreground">
                {overview.isPending ? (
                    <Skeleton className="h-5 w-64" />
                ) : overview.isError ? (
                    <>
                        概览加载失败
                        <Button
                            variant="link"
                            size="sm"
                            onClick={() => void overview.refetch()}
                        >
                            重试
                        </Button>
                    </>
                ) : (
                    <>
                        <span>用户 {overview.data.users}</span>
                        <span className="inline-flex items-center gap-inline">
                            <Network className="size-4" aria-hidden="true" />
                            节点在线 {online ?? "—"} / {overview.data.nodes}
                        </span>
                        {overview.data.openTickets ? (
                            <Button
                                variant="link"
                                size="sm"
                                asChild
                                className="h-auto p-0"
                            >
                                <Link to="/admin/tickets">
                                    {overview.data.openTickets} 个工单待处理
                                </Link>
                            </Button>
                        ) : (
                            <span>工单已全部处理</span>
                        )}
                    </>
                )}
            </div>

            {stats.isError ? (
                <Card>
                    <ErrorState
                        error={stats.error}
                        onRetry={() => stats.refetch()}
                    />
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-page lg:grid-cols-7">
                        <Card className="min-w-0 bg-primary/5 lg:col-span-5">
                            <CardHeader>
                                <div className="flex items-start gap-group">
                                    <IconBlock>
                                        <CreditCard />
                                    </IconBlock>
                                    <div className="min-w-0">
                                        <CardTitle className="text-sm">
                                            净收入
                                        </CardTitle>
                                        {stats.isPending ? (
                                            <Skeleton className="mt-field h-8 w-28" />
                                        ) : (
                                            <>
                                                <p className="numeric text-3xl font-semibold tracking-tight break-words sm:text-4xl">
                                                    {formatMinor(revenue[0])}
                                                </p>
                                                <Change
                                                    change={percentChange(
                                                        ...revenue,
                                                    )}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {chart(
                                    280,
                                    <ResponsiveContainer
                                        width="100%"
                                        height={280}
                                    >
                                        <AreaChart
                                            data={series}
                                            margin={chartMargin}
                                        >
                                            <defs>
                                                <linearGradient
                                                    id={revenueGradient}
                                                    x1="0"
                                                    y1="0"
                                                    x2="0"
                                                    y2="1"
                                                >
                                                    <stop
                                                        offset="0%"
                                                        stopColor="var(--primary)"
                                                        stopOpacity={0.35}
                                                    />
                                                    <stop
                                                        offset="100%"
                                                        stopColor="var(--primary)"
                                                        stopOpacity={0.02}
                                                    />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid
                                                vertical={false}
                                                stroke="var(--border)"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                dataKey="date"
                                                {...chartAxis}
                                                minTickGap={24}
                                            />
                                            <YAxis
                                                {...chartAxis}
                                                width={48}
                                                tickFormatter={(v) => `¥${v}`}
                                                allowDecimals={false}
                                            />
                                            <Tooltip
                                                {...chartTooltip}
                                                formatter={(v) => [
                                                    `¥${Number(v).toFixed(2)}`,
                                                    "净收入",
                                                ]}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="revenue"
                                                stroke="var(--primary)"
                                                fill={`url(#${revenueGradient})`}
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>,
                                )}
                            </CardContent>
                        </Card>
                        <Card className="min-w-0 lg:col-span-2">
                            <CardHeader>
                                <CardTitle>运营概况</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-field sm:grid-cols-3 lg:grid-cols-1">
                                {stats.isPending ? (
                                    ["orders", "users", "traffic"].map(
                                        (item) => (
                                            <Skeleton
                                                key={item}
                                                className="h-20"
                                            />
                                        ),
                                    )
                                ) : (
                                    <>
                                        <Metric
                                            title="已结算订单"
                                            icon={Receipt}
                                            value={String(paid[0])}
                                            current={paid[0]}
                                            previous={paid[1]}
                                        />
                                        <Metric
                                            title="新用户"
                                            icon={Users}
                                            value={String(users[0])}
                                            current={users[0]}
                                            previous={users[1]}
                                        />
                                        <Metric
                                            title="已用流量"
                                            icon={Gauge}
                                            value={formatTraffic(
                                                String(traffic[0]),
                                            )}
                                            current={traffic[0]}
                                            previous={traffic[1]}
                                            decreaseIsBad={false}
                                        />
                                    </>
                                )}
                            </CardContent>
                        </Card>
                        <Card className="min-w-0 lg:col-span-3">
                            <CardHeader>
                                <CardTitle>热门套餐</CardTitle>
                                <CardDescription>
                                    按支付金额排序
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.isPending ? (
                                    <Skeleton className="h-48" />
                                ) : stats.data.topPlans.length ? (
                                    <ol className="space-y-group">
                                        {stats.data.topPlans.map(
                                            (plan, index) => (
                                                <li key={plan.planName}>
                                                    <div className="mb-field flex items-baseline justify-between gap-group text-sm">
                                                        <span className="truncate">
                                                            <span className="numeric me-inline text-xs text-muted-foreground">
                                                                {index + 1}
                                                            </span>
                                                            {plan.planName}
                                                        </span>
                                                        <span className="numeric shrink-0">
                                                            {formatMinor(
                                                                plan.revenueMinor,
                                                            )}
                                                            <span className="ms-inline text-xs text-muted-foreground">
                                                                {plan.orders} 笔
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <Progress
                                                        className="h-2"
                                                        value={
                                                            (Math.max(
                                                                0,
                                                                plan.revenueMinor,
                                                            ) /
                                                                topMax) *
                                                            100
                                                        }
                                                    />
                                                </li>
                                            ),
                                        )}
                                    </ol>
                                ) : (
                                    <EmptyState
                                        title="暂无已支付订单"
                                        description="所选时间范围内无记录。"
                                    />
                                )}
                            </CardContent>
                        </Card>
                        <Card className="min-w-0 lg:col-span-4">
                            <CardHeader>
                                <CardTitle>新用户</CardTitle>
                                <CardDescription>单位：人</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {chart(
                                    220,
                                    <ResponsiveContainer
                                        width="100%"
                                        height={220}
                                    >
                                        <BarChart
                                            data={series}
                                            margin={chartMargin}
                                        >
                                            <CartesianGrid
                                                vertical={false}
                                                stroke="var(--border)"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                dataKey="date"
                                                {...chartAxis}
                                                minTickGap={24}
                                            />
                                            <YAxis
                                                {...chartAxis}
                                                width={32}
                                                allowDecimals={false}
                                            />
                                            <Tooltip
                                                {...chartTooltip}
                                                formatter={(v) => [
                                                    `${v} 人`,
                                                    "新用户",
                                                ]}
                                            />
                                            <Bar
                                                dataKey="users"
                                                fill="var(--primary)"
                                                radius={[4, 4, 0, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>,
                                )}
                            </CardContent>
                        </Card>
                        <Card className="min-w-0 lg:col-span-7">
                            <CardHeader>
                                <CardTitle>流量用量</CardTitle>
                                <CardDescription>单位：GB</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {chart(
                                    220,
                                    <ResponsiveContainer
                                        width="100%"
                                        height={220}
                                    >
                                        <AreaChart
                                            data={series}
                                            margin={chartMargin}
                                        >
                                            <CartesianGrid
                                                vertical={false}
                                                stroke="var(--border)"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                dataKey="date"
                                                {...chartAxis}
                                                minTickGap={24}
                                            />
                                            <YAxis
                                                {...chartAxis}
                                                width={64}
                                                tickFormatter={(v) =>
                                                    `${Number(v).toFixed(1)} GB`
                                                }
                                            />
                                            <Tooltip
                                                {...chartTooltip}
                                                formatter={(v) => [
                                                    `${Number(v).toFixed(2)} GB`,
                                                    "流量",
                                                ]}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="traffic"
                                                stroke="var(--chart-2)"
                                                fill="var(--chart-2)"
                                                fillOpacity={0.1}
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>,
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}

            <TrafficRankings days={range} />
            <div className="grid grid-cols-1 gap-page lg:grid-cols-2">
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle>最近订单</CardTitle>
                        <CardAction>
                            <Button variant="ghost" size="sm" asChild>
                                <Link to="/admin/orders">全部订单</Link>
                            </Button>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-group">
                        {orders.isError ? (
                            <ErrorState
                                error={orders.error}
                                onRetry={() => orders.refetch()}
                            />
                        ) : orders.isPending ? (
                            <Skeleton className="h-40" />
                        ) : orders.data.items.length === 0 ? (
                            <EmptyState title="暂无订单" />
                        ) : (
                            orders.data.items.map((order) => (
                                <div
                                    key={order.id}
                                    className="flex items-center justify-between gap-group"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {order.user.email}
                                        </p>
                                        <p className="numeric truncate text-xs text-muted-foreground">
                                            {order.planName} ·{" "}
                                            {formatDateTime(order.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-inline">
                                        <Badge
                                            variant={
                                                ORDER_STATUS[order.status].tone
                                            }
                                        >
                                            {ORDER_STATUS[order.status].label}
                                        </Badge>
                                        <span className="numeric min-w-16 text-end text-sm">
                                            {formatMinor(order.payableMinor)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle>节点状态</CardTitle>
                        <CardAction>
                            <Button variant="ghost" size="sm" asChild>
                                <Link to="/admin/nodes">管理节点</Link>
                            </Button>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-group">
                        {nodes.isError ? (
                            <ErrorState
                                error={nodes.error}
                                onRetry={() => nodes.refetch()}
                            />
                        ) : nodes.isPending ? (
                            <Skeleton className="h-40" />
                        ) : nodes.data.length === 0 ? (
                            <EmptyState title="暂无节点" />
                        ) : (
                            nodes.data.slice(0, 6).map((node) => {
                                const state = nodeState(node);
                                return (
                                    <div
                                        key={node.id}
                                        className="flex items-center justify-between gap-group"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {node.name}
                                            </p>
                                            <p className="numeric truncate text-xs text-muted-foreground">
                                                {PROTOCOL_LABEL[node.protocol]}{" "}
                                                · {node.host}:{node.port}
                                            </p>
                                        </div>
                                        <Badge variant={NODE_STATE_TONE[state]}>
                                            {state}
                                        </Badge>
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>
            </div>
        </Page>
    );
}
