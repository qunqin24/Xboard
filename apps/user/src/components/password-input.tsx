import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type PasswordInputProps = Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type"
> & {
    ref?: React.Ref<HTMLInputElement>;
};

/**
 * Input with a show/hide toggle. The 28px toggle sits 4px inside the 36px
 * field on every side, so its radius is the field radius minus 4px.
 */
export function PasswordInput({
    className,
    disabled,
    ref,
    ...props
}: PasswordInputProps) {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
        <div className={cn("relative", className)}>
            <Input
                type={showPassword ? "text" : "password"}
                className="pe-10"
                ref={ref}
                disabled={disabled}
                {...props}
            />
            <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled}
                className="absolute inset-e-1 top-1/2 size-7 -translate-y-1/2 rounded-inner text-muted-foreground"
                onClick={() => setShowPassword((prev) => !prev)}
            >
                {/* The icon shows the action, matching the label: eye = reveal. */}
                {showPassword ? <EyeOff /> : <Eye />}
                <span className="sr-only">
                    {showPassword ? "隐藏密码" : "显示密码"}
                </span>
            </Button>
        </div>
    );
}
