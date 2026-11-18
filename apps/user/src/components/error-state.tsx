import { useState } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useSpinTurn } from "@/hooks/use-spin-turn";
import { cn } from "@/lib/utils";
import { serverErrorMessage } from "@/lib/handle-server-error";
import { Button } from "./ui/button";

/**
 * A request failed: say so and offer a retry. Use wherever data is loaded, so
 * a failure never looks like an empty list, zero totals or an endless skeleton.
 */
export function ErrorState({
    error,
    onRetry,
    className,
}: {
    error?: unknown;
    /** May return the request's promise so the retry icon turns while it runs. */
    onRetry?: () => unknown;
    className?: string;
}) {
    const [retrying, setRetrying] = useState(false);
    const spin = useSpinTurn(retrying);
    const retry = () => {
        const result = onRetry?.();
        if (!(result instanceof Promise)) return;
        setRetrying(true);
        const done = () => setRetrying(false);
        result.then(done, done);
    };
    return (
        <div
            role="alert"
            className={cn(
                "flex flex-col items-center justify-center gap-group px-card py-8 text-center",
                className,
            )}
        >
            <div className="flex size-10 items-center justify-center rounded-surface bg-destructive/10 text-destructive">
                <TriangleAlert className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">加载失败</p>
                {error ? (
                    <p className="text-sm text-muted-foreground">
                        {serverErrorMessage(error)}
                    </p>
                ) : null}
            </div>
            {onRetry ? (
                <Button
                    variant="outline"
                    size="sm"
                    aria-busy={retrying || undefined}
                    onClick={retrying ? undefined : retry}
                >
                    <RotateCw
                        className={spin.className}
                        onAnimationIteration={spin.onAnimationIteration}
                    />
                    重试
                </Button>
            ) : null}
        </div>
    );
}
