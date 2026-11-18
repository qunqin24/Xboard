import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A table value with a small muted icon naming what it measures (traffic,
 * speed, devices). The icon is decorative; the column header names the value.
 */
export function IconText({
    icon: Icon,
    children,
    className,
}: {
    icon: LucideIcon;
    children: ReactNode;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "numeric inline-flex items-center gap-inline whitespace-nowrap",
                className,
            )}
        >
            <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
            />
            {children}
        </span>
    );
}
