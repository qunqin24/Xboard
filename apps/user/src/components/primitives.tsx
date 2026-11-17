import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "quiet" | "danger";
    size?: "sm" | "md";
    busy?: boolean;
};

export function buttonClass({
    variant = "primary",
    size = "md",
}: Pick<ButtonProps, "variant" | "size"> = {}) {
    const base =
        "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out-soft)] disabled:cursor-not-allowed disabled:opacity-50";
    const dimensions =
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm";
    const look =
        variant === "primary"
            ? "bg-ink text-paper hover:bg-ink-hover"
            : variant === "secondary"
              ? "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:bg-surface-raised"
              : variant === "danger"
                ? "border border-danger/30 bg-surface text-danger hover:border-danger/60 hover:bg-danger-soft"
                : "text-ink-muted hover:bg-surface-subtle hover:text-ink";
    return `${base} ${dimensions} ${look}`;
}

export function Button({
    variant,
    size,
    busy = false,
    children,
    className = "",
    ...props
}: ButtonProps) {
    return (
        <button
            type="button"
            {...props}
            aria-busy={busy || undefined}
            className={`${buttonClass({ variant, size })} ${className}`}
            disabled={busy || props.disabled}
        >
            {busy ? (
                <>
                    <span
                        aria-hidden
                        className="size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent"
                    />
                    处理中…
                </>
            ) : (
                children
            )}
        </button>
    );
}

export function Card({
    children,
    className = "",
    padded = true,
}: {
    children: ReactNode;
    className?: string;
    padded?: boolean;
}) {
    return (
        <section
            className={`rounded-lg border border-line bg-surface shadow-card ${padded ? "p-5" : ""} ${className}`}
        >
            {children}
        </section>
    );
}

/** Title row inside a card: heading on the left, optional actions on the right. */
export function CardHeader({
    title,
    description,
    actions,
    className = "",
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`flex flex-wrap items-start justify-between gap-3 ${className}`}
        >
            <div className="min-w-0">
                <h2 className="text-sm font-medium text-ink">{title}</h2>
                {description ? (
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? (
                <div className="flex shrink-0 items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}

export function PageHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-1.5 text-sm text-ink-muted">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? (
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </header>
    );
}

export function SectionLabel({ children }: { children: ReactNode }) {
    return <h2 className="text-xs font-medium text-ink-muted">{children}</h2>;
}

type Tone = "neutral" | "success" | "warn" | "danger" | "info";

const toneClass: Record<Tone, string> = {
    neutral: "border-line bg-surface-raised text-ink-muted",
    success: "border-signal/25 bg-signal-soft text-signal",
    warn: "border-warn/25 bg-warn-soft text-warn",
    danger: "border-danger/25 bg-danger-soft text-danger",
    info: "border-accent/25 bg-accent-soft text-accent",
};

const dotClass: Record<Tone, string> = {
    neutral: "bg-ink-subtle",
    success: "bg-signal",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-accent",
};

export function Badge({
    tone = "neutral",
    dot = false,
    children,
}: {
    tone?: Tone;
    dot?: boolean;
    children: ReactNode;
}) {
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-px text-xs font-medium ${toneClass[tone]}`}
        >
            {dot ? (
                <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${dotClass[tone]}`}
                />
            ) : null}
            {children}
        </span>
    );
}

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
    return (
        <span
            aria-hidden
            className={`inline-block size-2 shrink-0 rounded-full ${dotClass[tone]}`}
        />
    );
}

export function Stat({
    label,
    value,
    hint,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
}) {
    return (
        <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="numeric mt-2 text-2xl font-medium tracking-tight text-ink">
                {value}
            </dd>
            {hint ? (
                <dd className="mt-1 text-xs text-ink-subtle">{hint}</dd>
            ) : null}
        </div>
    );
}

export function Skeleton({ className = "" }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={`animate-pulse rounded-lg bg-surface-subtle ${className}`}
        />
    );
}

export function EmptyState({
    title,
    children,
    action,
}: {
    title: string;
    children?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink">{title}</p>
            {children ? (
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">
                    {children}
                </p>
            ) : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}

export function Notice({
    tone = "neutral",
    title,
    children,
    action,
}: {
    tone?: "neutral" | "warn";
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div
            role="status"
            className={`rounded-lg border p-5 ${
                tone === "warn"
                    ? "border-warn/30 bg-warn-soft"
                    : "border-line bg-surface"
            }`}
        >
            <p
                className={`text-sm font-medium ${tone === "warn" ? "text-warn" : "text-ink"}`}
            >
                {title}
            </p>
            <div className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">
                {children}
            </div>
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}

export function BrandMark({ className = "size-6" }: { className?: string }) {
    return (
        <span
            aria-hidden
            className={`grid place-items-center rounded-md bg-ink text-paper ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                className="size-[55%]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.75}
                strokeLinecap="round"
            >
                <path d="m6 6 12 12M18 6 6 18" />
            </svg>
        </span>
    );
}
