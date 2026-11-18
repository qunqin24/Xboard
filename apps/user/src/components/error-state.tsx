import { RotateCw, TriangleAlert } from "lucide-react";
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
    onRetry?: () => void;
    className?: string;
}) {
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
                <Button variant="outline" size="sm" onClick={onRetry}>
                    <RotateCw />
                    重试
                </Button>
            ) : null}
        </div>
    );
}
