import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const indicatorVariants = cva("h-full w-full flex-1 transition-transform", {
    variants: {
        tone: {
            default: "bg-primary",
            success: "bg-success",
            warning: "bg-warning",
            danger: "bg-destructive",
        },
    },
    defaultVariants: { tone: "default" },
});

/** A determinate bar for quotas and shares. `value` is 0–100. */
function Progress({
    className,
    value,
    tone,
    ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
    VariantProps<typeof indicatorVariants>) {
    const percent = Math.min(100, Math.max(0, value ?? 0));
    return (
        <ProgressPrimitive.Root
            data-slot="progress"
            value={percent}
            className={cn(
                "relative h-2 w-full overflow-hidden rounded-full bg-muted",
                className,
            )}
            {...props}
        >
            <ProgressPrimitive.Indicator
                data-slot="progress-indicator"
                className={indicatorVariants({ tone })}
                style={{ transform: `translateX(-${100 - percent}%)` }}
            />
        </ProgressPrimitive.Root>
    );
}

export { Progress };
