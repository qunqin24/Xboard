import { formatTraffic, toGiB } from "../lib/format";

/**
 * Bandwidth usage meter with subtle reference ticks for quota fractions.
 */
export function TrafficRuler({
    used,
    total,
    percent,
}: {
    used: string;
    total: string;
    percent: number;
}) {
    const quota = toGiB(total);
    const clamped = Math.min(100, Math.max(0, percent));
    const ticks = [0.25, 0.5, 0.75];

    return (
        <div className="mt-5">
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-active">
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out-soft)] ${
                        clamped >= 90 ? "bg-warn" : "bg-ink"
                    }`}
                    style={{ width: `${clamped}%` }}
                    aria-hidden
                />
                {ticks.map((tick) => (
                    <span
                        key={tick}
                        aria-hidden
                        className="absolute inset-y-0 w-px bg-paper/45"
                        style={{ left: `${tick * 100}%` }}
                    />
                ))}
            </div>
            <div
                role="meter"
                aria-label="已用流量占套餐额度的比例"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                aria-valuetext={`已用 ${formatTraffic(used)}，共 ${formatTraffic(total)}`}
                className="mt-2.5 flex justify-between text-xs text-ink-muted"
            >
                <span className="numeric">0</span>
                <span className="numeric">{formatTraffic(total)}</span>
            </div>
            {quota === 0 ? (
                <p className="mt-2 text-xs text-warn">此账户未设置流量额度。</p>
            ) : null}
        </div>
    );
}
