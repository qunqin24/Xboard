import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Full-page result shared by the 401/403/404/500/503 screens. */
export function ErrorResult({
    code,
    title,
    description,
    actions,
    className,
}: {
    code?: string;
    title: string;
    description: string;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex h-svh w-full flex-col items-center justify-center gap-group p-page text-center",
                className,
            )}
        >
            {code ? (
                <h1 className="text-9xl leading-tight font-bold">{code}</h1>
            ) : null}
            <div className="flex flex-col gap-field">
                <p className="font-medium">{title}</p>
                <p className="text-muted-foreground">{description}</p>
            </div>
            {actions ? <div className="flex gap-inline">{actions}</div> : null}
        </div>
    );
}
