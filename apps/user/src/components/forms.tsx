import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { Button } from "./primitives";

export const inputClass =
    "w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-muted outline-none transition-colors focus:border-line-strong";
export function Field({
    label,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
    const id = useId();
    return (
        <label htmlFor={id} className="block space-y-2 text-sm">
            <span>{label}</span>
            <input id={id} className={inputClass} {...props} />
        </label>
    );
}
export function TextArea({
    label,
    name,
    defaultValue,
    required = true,
}: {
    label: string;
    name: string;
    defaultValue?: string;
    required?: boolean;
}) {
    const id = useId();
    return (
        <label htmlFor={id} className="block space-y-2 text-sm">
            <span>{label}</span>
            <textarea
                id={id}
                name={name}
                defaultValue={defaultValue}
                required={required}
                maxLength={10000}
                rows={4}
                className={inputClass}
            />
        </label>
    );
}
export function Form({
    children,
    submit,
    busy,
    label = "保存",
}: {
    children: ReactNode;
    submit: (data: FormData) => void;
    busy?: boolean;
    label?: string;
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
            <Button type="submit" busy={busy}>
                {label}
            </Button>
        </form>
    );
}
export function Feedback({
    error,
    success,
}: {
    error?: Error | null;
    success?: boolean;
}) {
    return error ? (
        <p role="alert" className="mt-4 text-sm text-warn">
            {error.message}
        </p>
    ) : success ? (
        <p role="status" className="mt-4 text-sm text-signal">
            操作已完成。
        </p>
    ) : null;
}
