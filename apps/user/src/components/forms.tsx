import type {
    InputHTMLAttributes,
    ReactNode,
    SelectHTMLAttributes,
} from "react";
import { useId } from "react";
import { Button } from "./primitives";

export const inputClass =
    "h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink shadow-card outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle hover:border-line-strong focus:border-ink focus:ring-2 focus:ring-ink/10 read-only:bg-surface-raised";

function Label({
    htmlFor,
    label,
    hint,
}: {
    htmlFor: string;
    label: string;
    hint?: string;
}) {
    return (
        <span className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor={htmlFor} className="text-xs font-medium text-ink">
                {label}
            </label>
            {hint ? (
                <span className="text-xs text-ink-subtle">{hint}</span>
            ) : null}
        </span>
    );
}

export function Field({
    label,
    hint,
    className = "",
    ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
    const id = useId();
    return (
        <div className={className}>
            <Label htmlFor={id} label={label} hint={hint} />
            <input id={id} className={inputClass} {...props} />
        </div>
    );
}

export function Select({
    label,
    hint,
    options,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
    label: string;
    hint?: string;
    options: readonly string[];
}) {
    const id = useId();
    return (
        <div>
            <Label htmlFor={id} label={label} hint={hint} />
            <select id={id} className={`${inputClass} pr-8`} {...props}>
                {options.map((option) => (
                    <option key={option}>{option}</option>
                ))}
            </select>
        </div>
    );
}

export function TextArea({
    label,
    name,
    defaultValue,
    required = true,
    rows = 4,
}: {
    label: string;
    name: string;
    defaultValue?: string;
    required?: boolean;
    rows?: number;
}) {
    const id = useId();
    return (
        <div>
            <Label htmlFor={id} label={label} />
            <textarea
                id={id}
                name={name}
                defaultValue={defaultValue}
                required={required}
                maxLength={10000}
                rows={rows}
                className={`${inputClass} h-auto py-2 leading-relaxed`}
            />
        </div>
    );
}

export function Checkbox({
    label,
    description,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    description?: string;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 size-4" {...props} />
            <span>
                {label}
                {description ? (
                    <span className="block text-xs text-ink-muted">
                        {description}
                    </span>
                ) : null}
            </span>
        </label>
    );
}

export function Form({
    children,
    submit,
    busy,
    label = "保存",
    variant = "primary",
    secondary,
}: {
    children: ReactNode;
    submit: (data: FormData) => void;
    busy?: boolean;
    label?: string;
    variant?: "primary" | "secondary" | "danger";
    secondary?: ReactNode;
}) {
    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                submit(new FormData(event.currentTarget));
            }}
        >
            {children}
            <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="submit" busy={busy} variant={variant}>
                    {label}
                </Button>
                {secondary}
            </div>
        </form>
    );
}

export function Feedback({
    error,
    success,
    successText = "已保存。",
}: {
    error?: Error | null;
    success?: boolean;
    successText?: string;
}) {
    return error ? (
        <p
            role="alert"
            className="mt-4 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger"
        >
            {error.message}
        </p>
    ) : success ? (
        <p
            role="status"
            className="mt-4 rounded-md border border-signal/25 bg-signal-soft px-3 py-2 text-xs text-signal"
        >
            {successText}
        </p>
    ) : null;
}
