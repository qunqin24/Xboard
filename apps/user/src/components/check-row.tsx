import { type ReactNode } from "react";
import { Checkbox } from "./ui/checkbox";
import { FormControl, FormDescription, FormItem, FormLabel } from "./ui/form";

/**
 * An on/off field that is saved with its form ("发布", "开放注册"). Render it
 * inside a FormField. A Switch would suggest the change applies at once, which
 * is only true for settings that save immediately.
 */
export function CheckRow({
    label,
    description,
    checked,
    onCheckedChange,
    disabled,
}: {
    label: string;
    description?: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <FormItem className="flex items-start gap-3 rounded-surface border p-4">
            <FormControl>
                <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => onCheckedChange(value === true)}
                    disabled={disabled}
                />
            </FormControl>
            <div className="flex flex-col gap-1">
                <FormLabel className="leading-4">{label}</FormLabel>
                {description ? (
                    <FormDescription>{description}</FormDescription>
                ) : null}
            </div>
        </FormItem>
    );
}
