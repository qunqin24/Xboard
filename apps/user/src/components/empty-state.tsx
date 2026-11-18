import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nothing to show yet: a short noun phrase ("暂无订单"), at most one line of
 * reason, and the action that fills the space. Use inside a card or table.
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
}: {
    icon?: LucideIcon;
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-group px-card py-8 text-center",
                className,
            )}
        >
            {Icon ? (
                <div className="flex size-10 items-center justify-center rounded-surface bg-muted text-muted-foreground">
                    <Icon className="size-5" />
                </div>
            ) : null}
            <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{title}</p>
                {description ? (
                    <p className="text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {action}
        </div>
    );
}
