import { cn } from "@/lib/utils";

/**
 * Placeholder while loading; `shape="card"` stands in for a whole Card.
 * The light band is drawn in `styles/index.css`.
 */
function Skeleton({
    className,
    shape = "control",
    ...props
}: React.ComponentProps<"div"> & { shape?: "control" | "card" }) {
    return (
        <div
            data-slot="skeleton"
            aria-hidden="true"
            className={cn(
                shape === "card" ? "rounded-card" : "rounded-control",
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
