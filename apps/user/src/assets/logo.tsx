import { type SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Xboard mark: a cross inside a rounded square. */
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
    return (
        <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            height="24"
            width="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("size-6", className)}
            {...props}
        >
            <title>Xboard</title>
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <path d="m9 9 6 6M15 9l-6 6" />
        </svg>
    );
}
