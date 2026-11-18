import { Link } from "@tanstack/react-router";
import {
    ArrowDownRight,
    ArrowUpRight,
    CreditCard,
    Gauge,
    Receipt,
    Users,
} from "lucide-react";
import { useState } from "react";
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
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { NODE_STATE_TONE, ORDER_STATUS } from "./status";
import { GIB, nodeState } from "./units";

const RANGES = [7, 30, 90] as const;
const sum = (days: StatsDay[], pick: (day: StatsDay) => number) =>
    days.reduce((t, d) => t + pick(d), 0);

/** Percentage change, or null when there is no previous value to compare. */
export function percentChange(
    current: number,
    previous: number,
): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / previous) * 100;
}

function Kpi({
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
    const change = percentChange(current, previous);
    return (
        <Card className="gap-2">
            <CardHeader>
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <CardAction>
                    <Icon className="size-4 text-muted-foreground" />
                </CardAction>
            </CardHeader>
            <CardContent>
                <div className="numeric text-2xl font-bold">{value}</div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {change === null ? (
                        "上期无数据"
                    ) : (
                        <>
                            <span
                                className={cn(
                                    "numeric inline-flex items-center",
                                    change > 0 && "text-success",
                                    change < 0 &&
                                        (decreaseIsBad
                                            ? "text-destructive"
                                            : "text-muted-foreground"),
                                )}
                            >
                                {change > 0 ? (
                                    <ArrowUpRight className="size-3" />
                                ) : null}
                                {change < 0 ? (
                                    <ArrowDownRight className="size-3" />
                                ) : null}
                                {change > 0 ? "+" : ""}
                                {change.toFixed(change === 0 ? 0 : 1)}%
                            </span>
                            较上期
                        </>
                    )}
                </p>
            </CardContent>
        </Card>
    );
}

const axis = {
    stroke: "var(--muted-foreground)",
    fontSize: 12,
    tickLine: false,
    axisLine: false,
} as const;
const tooltipStyle = {
    contentStyle: {
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-control)",
        color: "var(--popover-foreground)",
        fontSize: 12,
    },
    labelStyle: { color: "var(--muted-foreground)" },
    cursor: { stroke: "var(--border)", fill: "var(--muted)" },
};
const chartMargin = { top: 4, right: 8, bottom: 0, left: 0 };

export function AdminDashboard() {
    const [range, setRange] = useState<(typeof RANGES)[number]>(30);
    // Twice the range: the older half is the comparison period. Top plans
    // cover only the selected range.
    const stats = usePanel<Stats>(
        `/admin/stats?days=${range * 2}&topDays=${range}`,
    );
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
        stats.isPending ? <Skeleton style={{ height }} /> : content;

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
                        <span>
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
                        onRetry={() => void stats.refetch()}
                    />
                </Card>
            ) : (
                <>
                    {stats.isPending ? (
                        <div className="grid gap-page sm:grid-cols-2 lg:grid-cols-4">
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-28" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid gap-page sm:grid-cols-2 lg:grid-cols-4">
                            <Kpi
                                title="收入"
                                icon={CreditCard}
                                value={formatMinor(revenue[0])}
                                current={revenue[0]}
                                previous={revenue[1]}
                            />
                            <Kpi
                                title="已支付订单"
                                icon={Receipt}
                                value={String(paid[0])}
                                current={paid[0]}
                                previous={paid[1]}
                            />
                            <Kpi
                                title="新用户"
                                icon={Users}
                                value={String(users[0])}
                                current={users[0]}
                                previous={users[1]}
                            />
                            <Kpi
                                title="流量"
                                icon={Gauge}
                                value={formatTraffic(String(traffic[0]))}
                                current={traffic[0]}
                                previous={traffic[1]}
                                decreaseIsBad={false}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-page lg:grid-cols-7">
                        <Card className="lg:col-span-4">
                            <CardHeader>
                                <CardTitle>每日收入</CardTitle>
                                <CardDescription>单位：元</CardDescription>
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
                                            <CartesianGrid
                                                vertical={false}
                                                stroke="var(--border)"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                dataKey="date"
                                                {...axis}
                                                minTickGap={24}
                                            />
                                            <YAxis
                                                {...axis}
                                                width={48}
                                                tickFormatter={(v) => `¥${v}`}
                                                allowDecimals={false}
                                            />
                                            <Tooltip
                                                {...tooltipStyle}
                                                formatter={(v) => [
                                                    `¥${Number(v).toFixed(2)}`,
                                                    "收入",
                                                ]}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="revenue"
                                                stroke="var(--primary)"
                                                fill="var(--primary)"
                                                fillOpacity={0.1}
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>,
                                )}
                            </CardContent>
                        </Card>
                        <Card className="lg:col-span-3">
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
                                                    <div className="mb-2 flex items-baseline justify-between gap-group text-sm">
                                                        <span className="truncate">
                                                            <span className="numeric me-2 text-xs text-muted-foreground">
                                                                {index + 1}
                                                            </span>
                                                            {plan.planName}
                                                        </span>
                                                        <span className="numeric shrink-0">
                                                            {formatMinor(
                                                                plan.revenueMinor,
                                                            )}
                                                            <span className="ms-2 text-xs text-muted-foreground">
                                                                {plan.orders} 笔
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <Progress
                                                        className="h-1.5"
                                                        value={
                                                            (plan.revenueMinor /
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
                        <Card className="lg:col-span-3">
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
                                                {...axis}
                                                minTickGap={24}
                                            />
                                            <YAxis
                                                {...axis}
                                                width={32}
                                                allowDecimals={false}
                                            />
                                            <Tooltip
                                                {...tooltipStyle}
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
                        <Card className="lg:col-span-4">
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
                                                {...axis}
                                                minTickGap={24}
                                            />
                                            <YAxis
                                                {...axis}
                                                width={64}
                                                tickFormatter={(v) =>
                                                    `${Number(v).toFixed(1)} GB`
                                                }
                                            />
                                            <Tooltip
                                                {...tooltipStyle}
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

            <div className="grid gap-page lg:grid-cols-2">
                <Card>
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
                                onRetry={() => void orders.refetch()}
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
                                        <p className="numeric text-xs text-muted-foreground">
                                            {order.planName} ·{" "}
                                            {formatDateTime(order.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-group">
                                        <Badge
                                            variant={
                                                ORDER_STATUS[order.status].tone
                                            }
                                        >
                                            {ORDER_STATUS[order.status].label}
                                        </Badge>
                                        <span className="numeric w-16 text-end text-sm">
                                            {formatMinor(order.amountMinor)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
                <Card>
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
                                onRetry={() => void nodes.refetch()}
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
                                            <p className="numeric text-xs text-muted-foreground">
                                                {node.protocol} · {node.host}:
                                                {node.port}
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
