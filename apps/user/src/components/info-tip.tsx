import { type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/**
 * Folded explanation next to a title or label: a small question-mark button
 * that opens the text on click or tap. Use it for rules people read once
 * (retention period, retry policy), not for anything needed to finish a task.
 */
export function InfoTip({
    children,
    label = "说明",
    className,
}: {
    children: ReactNode;
    label?: string;
    className?: string;
}) {
    return (
        <Popover>
            <PopoverTrigger
                aria-label={label}
                className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    className,
                )}
            >
                <CircleHelp className="size-4" />
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-auto max-w-80 text-sm leading-6 text-muted-foreground"
            >
                {children}
            </PopoverContent>
        </Popover>
    );
}
