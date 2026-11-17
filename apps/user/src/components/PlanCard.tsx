import { ArrowRight } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useCreateOrder } from "../api/hooks";
import type { Plan } from "@xboard/api-client";
import { Button } from "./primitives";
import { formatMinor, formatTraffic, periodLabel } from "../lib/format";

export function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
    const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">(
        (plan.prices[0]?.period as "monthly" | "quarterly" | "yearly") ??
            "monthly",
    );
    const requestId = useRef<string | null>(null);
    const create = useCreateOrder();
    const activePrice =
        plan.prices.find((p) => p.period === period) ?? plan.prices[0];

    return (
        <article
            className={`flex h-full flex-col justify-between rounded-xl border p-6 transition-colors ${
                current
                    ? "border-line-strong bg-surface shadow-xs"
                    : "border-line bg-surface hover:border-line-strong"
            }`}
        >
            <div>
                <div className="flex items-start justify-between gap-4">
                    <div>
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
                    {current ? (
                        <span className="shrink-0 rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-ink">
                            Current
                        </span>
                    ) : null}
                </div>

                <div className="mt-5 flex items-baseline justify-between gap-4">
                    <p className="numeric text-3xl font-semibold tracking-tight text-ink">
                        {activePrice
                            ? formatMinor(activePrice.amountMinor)
                            : "--"}
                        <span className="ml-1.5 text-xs font-normal text-ink-muted">
                            /{" "}
                            {activePrice ? periodLabel(activePrice.period) : ""}
                        </span>
                    </p>
                </div>

                {plan.prices.length > 0 ? (
                    <div
                        role="group"
                        aria-label={`${plan.name} 付款周期`}
                        className="mt-4 inline-flex w-full rounded-md border border-line bg-paper p-0.5"
                    >
                        {plan.prices.map((price) => {
                            const selected = price.period === period;
                            return (
                                <button
                                    key={price.period}
                                    type="button"
                                    disabled={create.isPending}
                                    onClick={() => {
                                        setPeriod(
                                            price.period as typeof period,
                                        );
                                        requestId.current = null;
                                        create.reset();
                                    }}
                                    className={`flex-1 cursor-pointer rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                        selected
                                            ? "bg-surface-active text-ink"
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
                        <dd className="numeric mt-1 font-medium text-ink">
                            {formatTraffic(plan.transferBytes)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-ink-muted">峰值限速</dt>
                        <dd className="numeric mt-1 font-medium text-ink">
                            {plan.speedLimitMbps
                                ? `${plan.speedLimitMbps} Mbps`
                                : "不限"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-ink-muted">在线设备</dt>
                        <dd className="numeric mt-1 font-medium text-ink">
                            {plan.deviceLimit ?? "不限"}
                        </dd>
                    </div>
                </dl>
            </div>

            <div className="mt-6 pt-2">
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
                            {
                                onSuccess: () => {
                                    requestId.current = null;
                                },
                            },
                        );
                    }}
                >
                    {current ? "创建续费订单" : "创建订单"}
                    <ArrowRight aria-hidden className="ml-2 size-3.5" />
                </Button>
                <p
                    id={`plan-${plan.id}-note`}
                    className={`mt-2 text-xs ${
                        create.isSuccess ? "text-signal" : "text-ink-muted"
                    }`}
                >
                    {create.isSuccess
                        ? "订单已创建，请在下方订单记录中支付。"
                        : "创建订单不扣款，保留 30 分钟。"}
                </p>
                {create.isError ? (
                    <p role="alert" className="mt-2 text-xs text-warn">
                        {create.error.message}
                    </p>
                ) : null}
            </div>
        </article>
    );
}
