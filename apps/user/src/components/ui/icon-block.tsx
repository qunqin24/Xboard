import { type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconBlockVariants = cva(
    "flex shrink-0 items-center justify-center rounded-control [&_svg]:size-5",
    {
        variants: {
            tone: {
                brand: "bg-primary/10 text-primary",
                neutral: "bg-muted text-muted-foreground",
                danger: "bg-destructive/10 text-destructive",
            },
            size: {
                default: "size-10 text-sm font-semibold",
                sm: "size-8 text-xs font-semibold [&_svg]:size-4",
            },
        },
        defaultVariants: { tone: "brand", size: "default" },
    },
);

/**
 * A tinted square holding an icon or a letter, leading a key-value pair or a
 * list row. Decorative: the text next to it carries the meaning.
 */
export function IconBlock({
    children,
    tone,
    size,
    className,
}: { children: ReactNode; className?: string } & VariantProps<
    typeof iconBlockVariants
>) {
    return (
        <div
            aria-hidden="true"
            className={cn(iconBlockVariants({ tone, size }), className)}
        >
            {children}
        </div>
    );
}
