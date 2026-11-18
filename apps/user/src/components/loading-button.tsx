import { type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { cn } from "@/lib/utils";

/**
 * A button that waits for the server. While `loading` it ignores clicks but
 * stays focusable (no `disabled`), so keyboard focus is not lost. The spinner
 * appears only after 300 ms and stays at least 500 ms; it takes the place of
 * `icon` (or sits over the label), so the button keeps its width.
 */
export function LoadingButton({
    loading = false,
    icon,
    children,
    onClick,
    className,
    ...props
}: React.ComponentProps<typeof Button> & {
    loading?: boolean;
    /** The leading icon, swapped for the spinner. */
    icon?: ReactNode;
}) {
    const spinning = useDelayedFlag(loading);
    const busy = loading || spinning;
    return (
        <Button
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                if (busy) {
                    event.preventDefault();
                    return;
                }
                onClick?.(event);
            }}
            className={cn(busy && "relative cursor-progress", className)}
            {...props}
        >
            {spinning && icon ? <Spinner /> : icon}
            {spinning && !icon ? (
                <>
                    <Spinner className="absolute" />
                    <span className="invisible inline-flex items-center gap-[inherit]">
                        {children}
                    </span>
                </>
            ) : (
                children
            )}
        </Button>
    );
}
