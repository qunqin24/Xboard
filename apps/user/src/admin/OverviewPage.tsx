import {
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { usePanel } from "../api/panel";
import { Feedback } from "../components/forms";
import {
    Badge,
    Card,
    CardHeader,
    PageHeader,
    Skeleton,
} from "../components/primitives";
import { formatDateTime, formatMinor, formatTraffic } from "../lib/format";
import { percentChange, RankBars, TimeChart } from "./charts";
import { GIB } from "./Editor";
import { nodeState } from "./NodesPage";
import type { NodeRow, OrderRow, Overview, Stats, StatsDay } from "./types";

const RANGES = [7, 30, 90] as const;

const yuan = (minor: number) => formatMinor(Math.round(minor));
const yuanAxis = (minor: number) =>
    minor >= 1_000_000
        ? `¥${(minor / 1_000_000).toFixed(1)}万`
        : `¥${Number((minor / 100).toFixed(2))}`;
const gb = (value: number) =>
    `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} GB`;

function sum(days: StatsDay[], pick: (day: StatsDay) => number) {
    return days.reduce((total, day) => total + pick(day), 0);
}

function Kpi({
    label,
    value,
    current,
    previous,
    loading,
}: {
    label: string;
    value: string;
    current: number;
    previous: number;
    loading: boolean;
}) {
    const change = percentChange(current, previous);
    return (
        <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <dt className="text-xs text-ink-muted">{label}</dt>
            {loading ? (
                <Skeleton className="mt-2 h-8 w-24" />
            ) : (
                <dd className="numeric mt-2 text-2xl font-medium tracking-tight text-ink">
                    {value}
                </dd>
            )}
            <dd className="mt-1 flex items-center gap-1 text-xs text-ink-subtle">
                {loading ? (
                    " "
                ) : change === null ? (
                    "上期为 0"
                ) : (
                    <>
                        <span
                            className={`numeric inline-flex items-center gap-0.5 ${
                                change > 0
                                    ? "text-signal"
                                    : change < 0
                                      ? "text-danger"
                                      : ""
                            }`}
                        >
                            {change > 0 ? (
                                <ArrowUpRight aria-hidden className="size-3" />
                            ) : change < 0 ? (
                                <ArrowDownRight
                                    aria-hidden
                                    className="size-3"
                                />
                            ) : null}
                            {change > 0 ? "+" : ""}
                            {change.toFixed(change === 0 ? 0 : 1)}%
                        </span>
                        较上期
                    </>
                )}
            </dd>
        </div>
    );
}

function ViewAll({
    to,
    children,
}: {
    to: "/admin/nodes" | "/admin/orders";
    children: ReactNode;
}) {
    return (
        <Link
            to={to}
            className="inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
        >
            {children}
            <ArrowRight aria-hidden className="size-3" />
        </Link>
    );
}

function ChartCard({
    title,
    total,
    children,
    className = "",
}: {
    title: string;
    total?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <Card className={className}>
            <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-medium text-ink">{title}</h2>
                {total ? (
                    <span className="numeric text-xs text-ink-muted">
                        {total}
                    </span>
                ) : null}
            </div>
            {children}
        </Card>
    );
}

export function OverviewPage() {
    const [range, setRange] = useState<(typeof RANGES)[number]>(30);
    // Fetch twice the range: the older half is the comparison period.
    const stats = usePanel<Stats>(`/admin/stats?days=${range * 2}`);
    const overview = usePanel<Overview>("/admin/overview");
    const nodes = usePanel<NodeRow[]>("/admin/nodes");
    const orders = usePanel<OrderRow[]>("/admin/orders");

    const all = stats.data?.days ?? [];
    const current = all.slice(-range);
    const previous = all.slice(0, Math.max(0, all.length - range));
    const loading = stats.isPending;
    const online = nodes.data?.filter(
        (n) => nodeState(n).tone === "success",
    ).length;
    const kpis = {
        revenue: [
            sum(current, (d) => d.revenueMinor),
            sum(previous, (d) => d.revenueMinor),
        ],
        orders: [
            sum(current, (d) => d.paidOrders),
            sum(previous, (d) => d.paidOrders),
        ],
        users: [
            sum(current, (d) => d.newUsers),
            sum(previous, (d) => d.newUsers),
        ],
        traffic: [
            sum(current, (d) => Number(d.trafficBytes)),
            sum(previous, (d) => Number(d.trafficBytes)),
        ],
    } as const;

    return (
        <div className="space-y-6">
            <PageHeader
                title="概览"
                description={
                    overview.data ? (
                        <>
                            共{" "}
                            <span className="numeric text-ink">
                                {overview.data.users}
                            </span>{" "}
                            个用户 · 节点在线{" "}
                            <span className="numeric text-ink">
                                {online ?? "—"} / {overview.data.nodes}
                            </span>{" "}
                            ·{" "}
                            {overview.data.openTickets ? (
                                <Link
                                    to="/admin/tickets"
                                    className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
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
                actions={
                    <div
                        role="group"
                        aria-label="统计范围"
                        className="inline-flex rounded-md border border-line bg-surface-raised p-0.5 text-xs"
                    >
                        {RANGES.map((days) => (
                            <button
                                key={days}
                                type="button"
                                aria-pressed={range === days}
                                onClick={() => setRange(days)}
                                className={`numeric cursor-pointer rounded px-3 py-1 font-medium transition-colors ${
                                    range === days
                                        ? "bg-surface text-ink shadow-card"
                                        : "text-ink-muted hover:text-ink"
                                }`}
                            >
                                近 {days} 天
                            </button>
                        ))}
                    </div>
                }
            />

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                    label="收入"
                    value={yuan(kpis.revenue[0])}
                    current={kpis.revenue[0]}
                    previous={kpis.revenue[1]}
                    loading={loading}
                />
                <Kpi
                    label="已支付订单"
                    value={String(kpis.orders[0])}
                    current={kpis.orders[0]}
                    previous={kpis.orders[1]}
                    loading={loading}
                />
                <Kpi
                    label="新用户"
                    value={String(kpis.users[0])}
                    current={kpis.users[0]}
                    previous={kpis.users[1]}
                    loading={loading}
                />
                <Kpi
                    label="流量"
                    value={formatTraffic(String(kpis.traffic[0]))}
                    current={kpis.traffic[0]}
                    previous={kpis.traffic[1]}
                    loading={loading}
                />
            </dl>
            <Feedback error={stats.error} />

            <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard
                    title="每日收入"
                    total={`合计 ${yuan(kpis.revenue[0])}`}
                    className="lg:col-span-2"
                >
                    {loading ? (
                        <Skeleton className="h-[200px]" />
                    ) : (
                        <TimeChart
                            label="每日收入"
                            data={current.map((d) => ({
                                label: d.date,
                                value: d.revenueMinor,
                            }))}
                            format={yuan}
                            axisFormat={yuanAxis}
                            floor={100}
                        />
                    )}
                </ChartCard>
                <ChartCard title="热门套餐" total="按收入">
                    {loading ? (
                        <Skeleton className="h-[200px]" />
                    ) : stats.data?.topPlans.length ? (
                        <RankBars
                            format={yuan}
                            items={stats.data.topPlans.map((plan) => ({
                                label: plan.planName,
                                value: plan.revenueMinor,
                                note: `${plan.orders} 笔`,
                            }))}
                        />
                    ) : (
                        <p className="py-16 text-center text-xs text-ink-muted">
                            这段时间还没有已支付订单。
                        </p>
                    )}
                </ChartCard>
                <ChartCard title="新用户" total={`合计 ${kpis.users[0]}`}>
                    {loading ? (
                        <Skeleton className="h-[160px]" />
                    ) : (
                        <TimeChart
                            kind="bar"
                            height={160}
                            label="每日新用户"
                            data={current.map((d) => ({
                                label: d.date,
                                value: d.newUsers,
                            }))}
                            format={(v) => `${v} 人`}
                            floor={4}
                            integer
                            axisFormat={(v) => String(v)}
                        />
                    )}
                </ChartCard>
                <ChartCard
                    title="流量用量"
                    total={`合计 ${formatTraffic(String(kpis.traffic[0]))}`}
                    className="lg:col-span-2"
                >
                    {loading ? (
                        <Skeleton className="h-[160px]" />
                    ) : (
                        <TimeChart
                            height={160}
                            label="每日流量"
                            data={current.map((d) => ({
                                label: d.date,
                                value: Number(d.trafficBytes) / GIB,
                            }))}
                            format={gb}
                            axisFormat={(v) => `${Number(v.toFixed(2))}`}
                        />
                    )}
                </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card padded={false}>
                    <CardHeader
                        className="px-5 pt-5 pb-3"
                        title="最近订单"
                        actions={<ViewAll to="/admin/orders">全部订单</ViewAll>}
                    />
                    {orders.data?.length ? (
                        <ul className="divide-y divide-line-subtle border-t border-line-subtle">
                            {orders.data.slice(0, 6).map((order) => (
                                <li
                                    key={order.id}
                                    className="flex items-center justify-between gap-3 px-5 py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm">
                                            {order.user.email}
                                        </p>
                                        <p className="numeric text-xs text-ink-subtle">
                                            {order.planName} ·{" "}
                                            {formatDateTime(order.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <Badge
                                            tone={
                                                order.status === "paid"
                                                    ? "success"
                                                    : order.status === "pending"
                                                      ? "warn"
                                                      : "neutral"
                                            }
                                        >
                                            {order.status === "paid"
                                                ? "已支付"
                                                : order.status === "pending"
                                                  ? "待支付"
                                                  : "已取消"}
                                        </Badge>
                                        <span className="numeric w-16 text-right text-sm">
                                            {formatMinor(order.amountMinor)}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="border-t border-line-subtle px-5 py-8 text-center text-xs text-ink-muted">
                            {orders.isPending ? "正在加载…" : "还没有订单。"}
                        </p>
                    )}
                </Card>

                <Card padded={false}>
                    <CardHeader
                        className="px-5 pt-5 pb-3"
                        title="节点状态"
                        actions={<ViewAll to="/admin/nodes">管理节点</ViewAll>}
                    />
                    {nodes.data?.length ? (
                        <ul className="divide-y divide-line-subtle border-t border-line-subtle">
                            {nodes.data.slice(0, 6).map((node) => {
                                const state = nodeState(node);
                                return (
                                    <li
                                        key={node.id}
                                        className="flex items-center justify-between gap-3 px-5 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm">
                                                {node.name}
                                            </p>
                                            <p className="numeric text-xs text-ink-subtle">
                                                {node.protocol} · {node.host}:
                                                {node.port}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-3">
                                            <span className="numeric text-xs text-ink-subtle">
                                                {formatDateTime(
                                                    node.lastSeenAt,
                                                )}
                                            </span>
                                            <Badge dot tone={state.tone}>
                                                {state.label}
                                            </Badge>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="border-t border-line-subtle px-5 py-8 text-center text-xs text-ink-muted">
                            {nodes.isPending ? "正在加载…" : "还没有节点。"}
                        </p>
                    )}
                </Card>
            </div>
        </div>
    );
}
