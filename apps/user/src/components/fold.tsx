import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { get, useFormState } from "react-hook-form";
import { Button } from "./ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "./ui/collapsible";

/**
 * A folded group of rarely needed form fields ("高级"). It opens by itself
 * when a field under `fields` (form paths or path prefixes) has an error, so
 * a failed save never hides the reason.
 */
export function Fold({
    title,
    status,
    fields,
    children,
}: {
    title: string;
    /** Short state shown while folded, e.g. a Badge "已启用". */
    status?: ReactNode;
    fields: string[];
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const { errors } = useFormState();
    const invalid = fields.some((name) => get(errors, name) !== undefined);
    return (
        <Collapsible open={open || invalid} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    className="group w-full justify-between"
                >
                    <span className="flex items-center gap-inline">
                        {title}
                        {status}
                    </span>
                    <ChevronDown className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-group pt-field">
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}
