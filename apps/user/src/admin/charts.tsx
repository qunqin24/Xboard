import { useEffect, useRef, useState } from "react";

/** Rounds up to 1, 2, 2.5 or 5 × 10ⁿ so axis labels stay readable. */
export function niceMax(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value)!;
    return step * power;
}

export function ticks(max: number, count = 4): number[] {
    return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

/** Percentage change, or null when there is no previous value to compare. */
export function percentChange(
    current: number,
    previous: number,
): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / previous) * 100;
}

function useWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) =>
            setWidth(Math.floor(entry!.contentRect.width)),
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

export type ChartPoint = { label: string; value: number };

/**
 * Daily series chart drawn in SVG: an area for continuous values, bars for
 * counts. Hovering (or focusing and using arrow keys) shows the day's value.
 */
export function TimeChart({
    data,
    kind = "area",
    format,
    axisFormat = format,
    height = 200,
    label,
    floor = 1,
    integer = false,
}: {
    data: ChartPoint[];
    kind?: "area" | "bar";
    format: (value: number) => string;
    axisFormat?: (value: number) => string;
    height?: number;
    label: string;
    /** Smallest axis maximum, so an all-zero series still gets a sensible scale. */
    floor?: number;
    /** Keep every tick on a whole number (counts). */
    integer?: boolean;
}) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const [active, setActive] = useState<number | null>(null);
    const left = 48;
    const right = 8;
    const top = 8;
    const bottom = 24;
    const plotWidth = Math.max(0, width - left - right);
    const plotHeight = height - top - bottom;
    const raw = Math.max(floor, ...data.map((d) => d.value));
    // Integer axes pick a whole-number step first so all four ticks are integers.
    const max = integer
        ? Math.max(1, Math.ceil(niceMax(raw / 4))) * 4
        : niceMax(raw);
    const n = data.length;
    const band = n ? plotWidth / n : 0;
    const x = (i: number) =>
        kind === "bar"
            ? left + band * i + band / 2
            : left + (n > 1 ? (plotWidth * i) / (n - 1) : plotWidth / 2);
    const y = (v: number) => top + plotHeight - (v / max) * plotHeight;
    const line = data
        .map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`)
        .join("");
    const area = n ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
    const labelEvery = Math.max(
        1,
        Math.ceil(n / Math.max(1, Math.floor(plotWidth / 64))),
    );
    const point = active === null ? null : data[active];
    // Label every Nth day, always the last one, and skip any that would crowd it.
    const showLabel = (i: number) =>
        i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.75);

    const pick = (clientX: number) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect || !n) return;
        const offset = clientX - rect.left - left;
        const index =
            kind === "bar"
                ? Math.floor(offset / band)
                : Math.round((offset / Math.max(1, plotWidth)) * (n - 1));
        setActive(Math.min(n - 1, Math.max(0, index)));
    };

    return (
        <div
            ref={ref}
            className="relative outline-none"
            tabIndex={0}
            role="img"
            aria-label={`${label}：${data.map((d) => `${d.label} ${format(d.value)}`).join("，")}`}
            onMouseMove={(event) => pick(event.clientX)}
            onMouseLeave={() => setActive(null)}
            onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    const step = event.key === "ArrowRight" ? 1 : -1;
                    setActive((i) =>
                        Math.min(n - 1, Math.max(0, (i ?? n - 1) + step)),
                    );
                }
            }}
            onBlur={() => setActive(null)}
        >
            {width ? (
                <svg
                    width={width}
                    height={height}
                    aria-hidden
                    className="block overflow-visible"
                >
                    {ticks(max).map((tick) => (
                        <g key={tick}>
                            <line
                                x1={left}
                                x2={width - right}
                                y1={y(tick)}
                                y2={y(tick)}
                                stroke="var(--color-line)"
                                strokeDasharray={tick ? "3 3" : undefined}
                            />
                            <text
                                x={left - 8}
                                y={y(tick)}
                                dy="0.32em"
                                textAnchor="end"
                                className="numeric fill-ink-subtle text-[10px]"
                            >
                                {axisFormat(tick)}
                            </text>
                        </g>
                    ))}
                    {data.map((d, i) =>
                        showLabel(i) ? (
                            <text
                                key={d.label}
                                x={x(i)}
                                y={height - 6}
                                textAnchor={
                                    i === 0 && kind === "area"
                                        ? "start"
                                        : i === n - 1 && kind === "area"
                                          ? "end"
                                          : "middle"
                                }
                                className="numeric fill-ink-subtle text-[10px]"
                            >
                                {d.label.slice(5)}
                            </text>
                        ) : null,
                    )}
                    {kind === "area" ? (
                        <>
                            <path
                                d={area}
                                fill="var(--color-ink)"
                                fillOpacity={0.06}
                            />
                            <path
                                d={line}
                                fill="none"
                                stroke="var(--color-ink)"
                                strokeWidth={1.75}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        </>
                    ) : (
                        data.map((d, i) => {
                            const w = Math.max(2, Math.min(28, band * 0.6));
                            return (
                                <rect
                                    key={d.label}
                                    x={x(i) - w / 2}
                                    y={y(d.value)}
                                    width={w}
                                    height={Math.max(0, y(0) - y(d.value))}
                                    rx={Math.min(3, w / 3)}
                                    fill="var(--color-ink)"
                                    fillOpacity={
                                        active === null || active === i
                                            ? 0.85
                                            : 0.3
                                    }
                                />
                            );
                        })
                    )}
                    {point && active !== null ? (
                        <>
                            <line
                                x1={x(active)}
                                x2={x(active)}
                                y1={top}
                                y2={y(0)}
                                stroke="var(--color-line-strong)"
                            />
                            {kind === "area" ? (
                                <circle
                                    cx={x(active)}
                                    cy={y(point.value)}
                                    r={4}
                                    fill="var(--color-surface)"
                                    stroke="var(--color-ink)"
                                    strokeWidth={2}
                                />
                            ) : null}
                        </>
                    ) : null}
                </svg>
            ) : (
                <div style={{ height }} />
            )}
            {point && active !== null ? (
                <div
                    className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
                    style={{
                        left: Math.min(
                            Math.max(0, x(active) - 60),
                            Math.max(0, width - 120),
                        ),
                    }}
                >
                    <p className="numeric text-ink-subtle">{point.label}</p>
                    <p className="numeric font-medium text-ink">
                        {format(point.value)}
                    </p>
                </div>
            ) : null}
        </div>
    );
}

/** Horizontal ranking bars, e.g. revenue per plan. */
export function RankBars({
    items,
    format,
}: {
    items: { label: string; value: number; note?: string }[];
    format: (value: number) => string;
}) {
    const max = Math.max(1, ...items.map((item) => item.value));
    return (
        <ol className="space-y-3">
            {items.map((item, index) => (
                <li key={item.label}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-baseline gap-2">
                            <span className="numeric text-xs text-ink-subtle">
                                {index + 1}
                            </span>
                            <span className="truncate text-ink">
                                {item.label}
                            </span>
                        </span>
                        <span className="numeric shrink-0 text-ink">
                            {format(item.value)}
                            {item.note ? (
                                <span className="ml-1.5 text-xs text-ink-subtle">
                                    {item.note}
                                </span>
                            ) : null}
                        </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-active">
                        <div
                            className="h-1.5 rounded-full bg-ink"
                            style={{ width: `${(item.value / max) * 100}%` }}
                        />
                    </div>
                </li>
            ))}
        </ol>
    );
}
