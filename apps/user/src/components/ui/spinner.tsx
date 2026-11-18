import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one loading circle: 16px, a turn every 0.9 s, a soft pulse under reduced motion. */
export function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
    return (
        <Loader2
            aria-hidden="true"
            data-slot="spinner"
            className={cn("spinner", className)}
            {...props}
        />
    );
}
