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
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatMinor, formatTraffic } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NodeRow, OrderRow, Overview, Stats, StatsDay } from "./types";
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
}: {
    title: string;
    icon: React.ElementType;
    value: string;
    current: number;
    previous: number;
}) {
    const change = percentChange(current, previous);
    return (
        <Card className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="numeric text-2xl font-bold">{value}</div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {change === null ? (
                        "上期为 0"
                    ) : (
                        <>
                            <span
                                className={cn(
                                    "numeric inline-flex items-center",
                                    change > 0 &&
                                        "text-emerald-600 dark:text-emerald-400",
                                    change < 0 && "text-destructive",
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
        borderRadius: "var(--radius)",
        color: "var(--popover-foreground)",
        fontSize: 12,
    },
    labelStyle: { color: "var(--muted-foreground)" },
    cursor: { stroke: "var(--border)", fill: "var(--muted)" },
};

export function AdminDashboard() {
    const [range, setRange] = useState<(typeof RANGES)[number]>(30);
    // Twice the range: the older half is the comparison period.
    const stats = usePanel<Stats>(`/admin/stats?days=${range * 2}`);
    const overview = usePanel<Overview>("/admin/overview");
    const nodes = usePanel<NodeRow[]>("/admin/nodes");
    const orders = usePanel<OrderRow[]>("/admin/orders");

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

    return (
        <Page
            title="仪表盘"
            description={
                overview.data ? (
                    <>
                        共 {overview.data.users} 个用户 · 节点在线{" "}
                        {online ?? "—"} / {overview.data.nodes} ·{" "}
                        {overview.data.openTickets ? (
                            <Link
                                to="/admin/tickets"
                                className="text-foreground underline underline-offset-4"
                            >
                                {overview.data.openTickets} 个工单待处理
                            </Link>
                        ) : (
                            "工单已全部处理"
                        )}
                    </>
                ) : (
                    "正在加载…"
                )
            }
        >
            <Tabs
                value={String(range)}
                onValueChange={(v) =>
                    setRange(Number(v) as (typeof RANGES)[number])
                }
            >
                <TabsList>
                    {RANGES.map((days) => (
                        <TabsTrigger key={days} value={String(days)}>
                            近 {days} 天
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value={String(range)} className="space-y-4">
                    {stats.isPending ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-28" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
                        <Card className="lg:col-span-4">
                            <CardHeader>
                                <CardTitle>每日收入</CardTitle>
                                <CardDescription>
                                    合计 {formatMinor(revenue[0])}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="ps-2">
                                <ResponsiveContainer width="100%" height={280}>
                                    <AreaChart data={series}>
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
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card className="lg:col-span-3">
                            <CardHeader>
                                <CardTitle>热门套餐</CardTitle>
                                <CardDescription>
                                    按已支付金额排序
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stats.data?.topPlans.length ? (
                                    <ol className="space-y-4">
                                        {stats.data.topPlans.map(
                                            (plan, index) => (
                                                <li key={plan.planName}>
                                                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
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
                                                            <span className="ms-1.5 text-xs text-muted-foreground">
                                                                {plan.orders} 笔
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-muted">
                                                        <div
                                                            className="h-full rounded-full bg-primary"
                                                            style={{
                                                                width: `${(plan.revenueMinor / topMax) * 100}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </li>
                                            ),
                                        )}
                                    </ol>
                                ) : (
                                    <p className="py-16 text-center text-sm text-muted-foreground">
                                        这段时间还没有已支付订单。
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                        <Card className="lg:col-span-3">
                            <CardHeader>
                                <CardTitle>新用户</CardTitle>
                                <CardDescription>
                                    合计 {users[0]} 人
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="ps-2">
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={series}>
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
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card className="lg:col-span-4">
                            <CardHeader>
                                <CardTitle>流量用量</CardTitle>
                                <CardDescription>
                                    合计 {formatTraffic(String(traffic[0]))}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="ps-2">
                                <ResponsiveContainer width="100%" height={220}>
                                    <AreaChart data={series}>
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
                                            tickFormatter={(v) =>
                                                `${Number(v).toFixed(1)}`
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
                                            fillOpacity={0.15}
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>最近订单</CardTitle>
                        <Link
                            to="/admin/orders"
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            全部订单
                        </Link>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {orders.data?.slice(0, 6).map((order) => (
                            <div
                                key={order.id}
                                className="flex items-center justify-between gap-3"
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
                                <div className="flex shrink-0 items-center gap-3">
                                    <Badge
                                        variant={
                                            order.status === "paid"
                                                ? "default"
                                                : order.status === "pending"
                                                  ? "outline"
                                                  : "secondary"
                                        }
                                    >
                                        {order.status === "paid"
                                            ? "已支付"
                                            : order.status === "pending"
                                              ? "待支付"
                                              : "已取消"}
                                    </Badge>
                                    <span className="numeric w-16 text-end text-sm">
                                        {formatMinor(order.amountMinor)}
                                    </span>
                                </div>
                            </div>
                        )) ?? <Skeleton className="h-40" />}
                        {orders.data?.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                还没有订单。
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>节点状态</CardTitle>
                        <Link
                            to="/admin/nodes"
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            管理节点
                        </Link>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {nodes.data?.slice(0, 6).map((node) => {
                            const state = nodeState(node);
                            return (
                                <div
                                    key={node.id}
                                    className="flex items-center justify-between gap-3"
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
                                    <Badge
                                        variant={
                                            state === "在线"
                                                ? "default"
                                                : state === "离线"
                                                  ? "destructive"
                                                  : "secondary"
                                        }
                                    >
                                        {state}
                                    </Badge>
                                </div>
                            );
                        }) ?? <Skeleton className="h-40" />}
                        {nodes.data?.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                还没有节点。
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </Page>
    );
}
