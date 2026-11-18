import { cn } from "@/lib/utils";
import type { SaveState } from "@/api/optimistic";

/**
 * The quiet state of an optimistic change, always in the same place beside the
 * item: "保存中…", "已保存", or "保存失败" with a retry. Its width is reserved,
 * so the row never moves when the text appears. Failure shakes the text twice.
 */
export function SaveStatus({
    state,
    onRetry,
    className,
}: {
    state?: SaveState;
    onRetry?: () => void;
    className?: string;
}) {
    return (
        <span
            role="status"
            aria-live="polite"
            className={cn(
                "inline-flex min-w-20 items-center gap-1 text-xs text-muted-foreground",
                className,
            )}
        >
            {state === "saving" ? "保存中…" : null}
            {state === "saved" ? "已保存" : null}
            {state === "failed" ? (
                <span className="shake inline-flex items-center gap-1 text-destructive">
                    保存失败
                    {onRetry ? (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onRetry();
                            }}
                            className="rounded-inner underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                            重试
                        </button>
                    ) : null}
                </span>
            ) : null}
        </span>
    );
}
