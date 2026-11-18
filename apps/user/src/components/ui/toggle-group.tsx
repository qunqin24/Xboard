import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

/**
 * Segmented control: pick one value from 2–5 short options that filter or
 * switch the current view (date range, billing period). Not for navigation
 * between pages (use links) and not for form fields submitted later (use
 * RadioGroup or Select).
 */
function ToggleGroup({
    className,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
    return (
        <ToggleGroupPrimitive.Root
            data-slot="toggle-group"
            className={cn(
                "inline-flex h-10 w-fit items-center rounded-surface bg-muted p-1 text-muted-foreground",
                className,
            )}
            {...props}
        />
    );
}

function ToggleGroupItem({
    className,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
    return (
        <ToggleGroupPrimitive.Item
            data-slot="toggle-group-item"
            className={cn(
                "inline-flex h-full flex-1 items-center justify-center gap-2 rounded-control px-3 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/30 [&_svg]:size-4 [&_svg]:shrink-0",
                className,
            )}
            {...props}
        />
    );
}

export { ToggleGroup, ToggleGroupItem };
