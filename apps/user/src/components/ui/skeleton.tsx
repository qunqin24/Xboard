import { cn } from "@/lib/utils";

/** Placeholder while loading; `shape="card"` stands in for a whole Card. */
function Skeleton({
    className,
    shape = "control",
    ...props
}: React.ComponentProps<"div"> & { shape?: "control" | "card" }) {
    return (
        <div
            data-slot="skeleton"
            className={cn(
                "animate-pulse bg-accent",
                shape === "card" ? "rounded-card" : "rounded-control",
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
