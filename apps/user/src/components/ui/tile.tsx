import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tileVariants = cva(
    "flex items-center gap-3 rounded-surface border p-3 transition-colors",
    {
        variants: {
            tone: {
                default: "bg-card",
                // The suggested choice among sibling tiles.
                highlight: "border-primary/40 bg-primary/5",
            },
        },
        defaultVariants: { tone: "default" },
    },
);

/**
 * A bordered block inside a card for one choosable item (a client, a plan
 * option). Its 12px radius sits concentric with the card's 16px.
 */
function Tile({
    className,
    tone,
    ...props
}: React.ComponentProps<"div"> & VariantProps<typeof tileVariants>) {
    return (
        <div
            data-slot="tile"
            className={cn(tileVariants({ tone }), className)}
            {...props}
        />
    );
}

export { Tile };
