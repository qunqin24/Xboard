import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Card } from "../components/primitives";

/** Side panel used by admin pages to create or edit one record. */
export function EditorPanel({
    title,
    description,
    onClose,
    children,
}: {
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
}) {
    return (
        <Card className="lg:sticky lg:top-6">
            <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-medium text-ink">{title}</h2>
                    {description ? (
                        <p className="mt-1 text-xs text-ink-muted">
                            {description}
                        </p>
                    ) : null}
                </div>
                <button
                    type="button"
                    aria-label="关闭"
                    onClick={onClose}
                    className="-m-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                >
                    <X aria-hidden className="size-4" />
                </button>
            </div>
            {children}
        </Card>
    );
}

/** Two-column page body: the list grows, the editor sits on the right when open. */
export function WithEditor({
    editor,
    children,
}: {
    editor: ReactNode | null;
    children: ReactNode;
}) {
    return (
        <div
            className={`grid items-start gap-6 ${
                editor ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""
            }`}
        >
            <div className="min-w-0">{children}</div>
            {editor ? (
                <div className="order-first lg:order-none">{editor}</div>
            ) : null}
        </div>
    );
}

export const GIB = 1024 ** 3;

export const bytesToGiB = (bytes: string) =>
    Number((Number(bytes) / GIB).toFixed(2)).toString();

export const giBToBytes = (value: FormDataEntryValue | null) =>
    String(Math.round(Number(value) * GIB));

export const yuanToMinor = (value: FormDataEntryValue | null) =>
    Math.round(Number(value) * 100);

export const minorToYuan = (minor: number) => (minor / 100).toFixed(2);
