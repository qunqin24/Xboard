import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { usePanel } from "../api/panel";
import {
    Badge,
    Card,
    CardHeader,
    PageHeader,
    Skeleton,
    Stat,
} from "../components/primitives";
import { Feedback } from "../components/forms";
import { formatDateTime, formatMinor } from "../lib/format";
import { nodeState } from "./NodesPage";
import type { NodeRow, OrderRow, Overview } from "./types";

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

export function OverviewPage() {
    const stats = usePanel<Overview>("/admin/overview");
    const nodes = usePanel<NodeRow[]>("/admin/nodes");
    const orders = usePanel<OrderRow[]>("/admin/orders");
    const online = nodes.data?.filter(
        (n) => nodeState(n).tone === "success",
    ).length;

    return (
        <div className="space-y-8">
            <PageHeader
                title="概览"
                description="用户、收入、节点和待办的当前状态。"
            />

            {stats.data ? (
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label="用户" value={stats.data.users} />
                    <Stat
                        label="已支付金额"
                        value={formatMinor(stats.data.revenueMinor)}
                        hint={`共 ${stats.data.orders} 笔订单`}
                    />
                    <Stat
                        label="节点在线"
                        value={
                            <>
                                {online ?? "—"}
                                <span className="text-base text-ink-subtle">
                                    {" "}
                                    / {stats.data.nodes}
                                </span>
                            </>
                        }
                        hint="最近 3 分钟有上报"
                    />
                    <Stat
                        label="待处理工单"
                        value={stats.data.openTickets}
                        hint={
                            stats.data.openTickets ? (
                                <Link
                                    to="/admin/tickets"
                                    className="underline-offset-2 hover:text-ink hover:underline"
                                >
                                    去处理
                                </Link>
                            ) : (
                                "全部处理完毕"
                            )
                        }
                    />
                </dl>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[104px]" />
                    ))}
                </div>
            )}
            <Feedback error={stats.error} />

            <div className="grid gap-6 lg:grid-cols-2">
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
