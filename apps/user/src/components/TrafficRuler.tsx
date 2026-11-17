import { formatTraffic, toGiB } from "../lib/format";

/** Quota meter: a thin bar that turns amber past 90% and red when exhausted. */
export function TrafficRuler({
    used,
    total,
    percent,
}: {
    used: string;
    total: string;
    percent: number;
}) {
    const clamped = Math.min(100, Math.max(0, percent));
    const fill =
        clamped >= 100 ? "bg-danger" : clamped >= 90 ? "bg-warn" : "bg-ink";

    return (
        <div className="mt-5">
            <div
                role="meter"
                aria-label="已用流量占周期额度的比例"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(clamped)}
                aria-valuetext={`已用 ${formatTraffic(used)}，共 ${formatTraffic(total)}`}
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-active"
            >
                <div
                    aria-hidden
                    className={`h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-soft)] ${fill}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
            {toGiB(total) === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">
                    开通套餐后显示流量额度。
                </p>
            ) : null}
        </div>
    );
}
