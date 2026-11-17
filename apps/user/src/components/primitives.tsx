import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "quiet";
    busy?: boolean;
};

export function Button({
    variant = "primary",
    busy = false,
    children,
    className = "",
    ...props
}: ButtonProps) {
    const base =
        "inline-flex items-center justify-center rounded-md px-3.5 py-2 text-xs font-medium transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-out-soft)] active:translate-y-px disabled:cursor-not-allowed";
    const look =
        variant === "primary"
            ? "bg-ink text-paper hover:bg-ink-hover"
            : variant === "secondary"
              ? "border border-line bg-surface-raised text-ink hover:border-line-strong hover:bg-surface-subtle"
              : "text-ink-muted hover:bg-surface-subtle hover:text-ink";
    const disabled =
        props.disabled || busy
            ? "disabled:bg-surface-subtle disabled:text-ink-subtle disabled:border-line"
            : "";
    return (
        <button
            {...props}
            className={`${base} ${look} ${disabled} ${className}`}
            disabled={busy || props.disabled}
        >
            {busy ? "处理中…" : children}
        </button>
    );
}

export function Card({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={`rounded-xl border border-line bg-surface p-5 ${className}`}
        >
            {children}
        </section>
    );
}

export function SectionLabel({ children }: { children: ReactNode }) {
    return <h2 className="text-xs font-medium text-ink-muted">{children}</h2>;
}

export function Skeleton({ className = "" }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={`animate-pulse rounded-lg bg-surface-subtle ${className}`}
        />
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
    const border = tone === "warn" ? "border-warn/35" : "border-line";
    return (
        <div
            role="status"
            className={`rounded-xl border ${border} bg-surface p-6`}
        >
            <p className="text-sm font-medium text-ink">{title}</p>
            <div className="mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">
                {children}
            </div>
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}
