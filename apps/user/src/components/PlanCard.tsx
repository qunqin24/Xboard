import { useRef, useState } from "react";
import { useCreateOrder } from "../api/hooks";
import type { Plan } from "@xboard/api-client";
import { Badge, Button } from "./primitives";
import { formatMinor, formatTraffic, periodLabel } from "../lib/format";

type Period = "monthly" | "quarterly" | "yearly";

export function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
    const [period, setPeriod] = useState<Period>(
        (plan.prices[0]?.period as Period) ?? "monthly",
    );
    const requestId = useRef<string | null>(null);
    const create = useCreateOrder();
    const activePrice =
        plan.prices.find((p) => p.period === period) ?? plan.prices[0];

    return (
        <article
            className={`flex h-full flex-col rounded-lg border bg-surface p-6 shadow-card transition-colors ${
                current ? "border-ink" : "border-line hover:border-line-strong"
            }`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-ink">
                        {plan.name}
                    </h3>
                    {plan.description ? (
                        <p
                            className="mt-1 text-xs leading-relaxed text-ink-muted"
                            style={{ textWrap: "pretty" }}
                        >
                            {plan.description}
                        </p>
                    ) : null}
                </div>
                {current ? <Badge tone="info">当前套餐</Badge> : null}
            </div>

            <p className="mt-6 flex items-baseline gap-1.5">
                <span className="numeric text-3xl font-medium tracking-tight text-ink">
                    {activePrice ? formatMinor(activePrice.amountMinor) : "—"}
                </span>
                <span className="text-xs text-ink-muted">
                    / {activePrice ? periodLabel(activePrice.period) : ""}
                </span>
            </p>

            {plan.prices.length > 1 ? (
                <div
                    role="group"
                    aria-label={`${plan.name} 付款周期`}
                    className="mt-4 grid auto-cols-fr grid-flow-col rounded-md border border-line bg-surface-raised p-0.5"
                >
                    {plan.prices.map((price) => {
                        const selected = price.period === period;
                        return (
                            <button
                                key={price.period}
                                type="button"
                                aria-pressed={selected}
                                disabled={create.isPending}
                                onClick={() => {
                                    setPeriod(price.period as Period);
                                    requestId.current = null;
                                    create.reset();
                                }}
                                className={`cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                    selected
                                        ? "bg-surface text-ink shadow-card"
                                        : "text-ink-muted hover:text-ink"
                                }`}
                            >
                                {periodLabel(price.period)}
                            </button>
                        );
                    })}
                </div>
            ) : null}

            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line-subtle pt-4 text-xs">
                <div>
                    <dt className="text-ink-muted">周期流量</dt>
                    <dd className="numeric mt-1 text-sm text-ink">
                        {formatTraffic(plan.transferBytes)}
                    </dd>
                </div>
                <div>
                    <dt className="text-ink-muted">限速</dt>
                    <dd className="numeric mt-1 text-sm text-ink">
                        {plan.speedLimitMbps
                            ? `${plan.speedLimitMbps} Mbps`
                            : "不限"}
                    </dd>
                </div>
                <div>
                    <dt className="text-ink-muted">设备</dt>
                    <dd className="numeric mt-1 text-sm text-ink">
                        {plan.deviceLimit ? `${plan.deviceLimit} 台` : "不限"}
                    </dd>
                </div>
            </dl>

            <div className="mt-auto pt-6">
                <Button
                    variant={current ? "primary" : "secondary"}
                    disabled={!plan.prices.length}
                    busy={create.isPending}
                    className="w-full"
                    aria-describedby={`plan-${plan.id}-note`}
                    onClick={() => {
                        requestId.current ??= crypto.randomUUID();
                        create.mutate(
                            {
                                planId: plan.id,
                                period,
                                requestId: requestId.current,
                            },
                            { onSuccess: () => (requestId.current = null) },
                        );
                    }}
                >
                    {current ? "续费" : "购买"}
                </Button>
                <p
                    id={`plan-${plan.id}-note`}
                    className={`mt-2 text-center text-xs ${create.isSuccess ? "text-signal" : "text-ink-subtle"}`}
                >
                    {create.isSuccess
                        ? "订单已创建，请在下方订单中支付。"
                        : "先创建订单，确认后再从余额扣款。"}
                </p>
                {create.isError ? (
                    <p
                        role="alert"
                        className="mt-2 text-center text-xs text-danger"
                    >
                        {create.error.message}
                    </p>
                ) : null}
            </div>
        </article>
    );
}
