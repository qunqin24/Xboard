import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { Button } from "./primitives";

/** Modal built on the native <dialog>: focus containment, Esc and top layer for free. */
export function Dialog({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    width = "28rem",
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    width?: string;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            className="app-dialog"
            style={{ width: `min(${width}, calc(100vw - 2rem))` }}
            aria-labelledby="dialog-title"
            onClose={onClose}
            onClick={(event) => {
                if (event.target === ref.current) onClose();
            }}
        >
            {open ? (
                <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2
                                id="dialog-title"
                                className="text-base font-semibold text-ink"
                            >
                                {title}
                            </h2>
                            {description ? (
                                <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                                    {description}
                                </div>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            aria-label="关闭"
                            onClick={onClose}
                            className="-m-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink"
                        >
                            <X aria-hidden className="size-4" />
                        </button>
                    </div>
                    {children ? <div className="mt-4">{children}</div> : null}
                    {footer ? (
                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                            {footer}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </dialog>
    );
}

type ConfirmOptions = {
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    tone?: "danger" | "default";
};

const ConfirmContext = createContext<
    (options: ConfirmOptions) => Promise<boolean>
>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<
        (ConfirmOptions & { resolve: (value: boolean) => void }) | null
    >(null);
    const confirm = useCallback(
        (options: ConfirmOptions) =>
            new Promise<boolean>((resolve) =>
                setState({ ...options, resolve }),
            ),
        [],
    );
    const settle = (value: boolean) => {
        state?.resolve(value);
        setState(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Dialog
                open={state !== null}
                onClose={() => settle(false)}
                title={state?.title ?? ""}
                description={state?.description}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => settle(false)}
                        >
                            取消
                        </Button>
                        <Button
                            autoFocus
                            variant={
                                state?.tone === "danger" ? "danger" : "primary"
                            }
                            onClick={() => settle(true)}
                        >
                            {state?.confirmLabel ?? "确认"}
                        </Button>
                    </>
                }
            />
        </ConfirmContext.Provider>
    );
}

/** Promise-based confirmation, e.g. `if (!(await confirm({...}))) return;` */
export function useConfirm() {
    return useContext(ConfirmContext);
}

type Toast = { id: number; tone: "success" | "error"; message: string };

const ToastContext = createContext<{
    success: (message: string) => void;
    error: (message: string) => void;
}>({ success: () => undefined, error: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const next = useRef(0);
    const dismiss = useCallback(
        (id: number) => setToasts((list) => list.filter((t) => t.id !== id)),
        [],
    );
    const push = useCallback(
        (tone: Toast["tone"], message: string) => {
            const id = ++next.current;
            setToasts((list) => [...list.slice(-3), { id, tone, message }]);
            setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
        },
        [dismiss],
    );
    const [api] = useState(() => ({
        success: (message: string) => push("success", message),
        error: (message: string) => push("error", message),
    }));

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div
                aria-live="polite"
                className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role={toast.tone === "error" ? "alert" : "status"}
                        className="animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink shadow-lg"
                    >
                        {toast.tone === "success" ? (
                            <CheckCircle
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 text-signal"
                            />
                        ) : (
                            <WarningCircle
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 text-danger"
                            />
                        )}
                        <p className="flex-1">{toast.message}</p>
                        <button
                            type="button"
                            aria-label="关闭提示"
                            onClick={() => dismiss(toast.id)}
                            className="-m-1 grid size-6 cursor-pointer place-items-center rounded text-ink-subtle hover:text-ink"
                        >
                            <X aria-hidden className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
