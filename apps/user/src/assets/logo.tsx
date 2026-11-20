import { useId, type SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Ring tilt and the two halves of the orbit, in the mark's local frame. */
const ORBIT = "translate(100 100) rotate(-20)";
const FRONT = "M-84,0A84 26 0 0 0 84,0";
const BACK = "M-84,0A84 26 0 0 1 84,0";

/**
 * Xboard mark: the panel as a planet, nodes on the orbit around it.
 * Drawn in `currentColor` (the theme's primary by default) so it follows dark
 * mode; `public/favicon.svg` is the same mark on a fixed indigo tile. Mask ids
 * are scoped per instance so several logos can render on one page.
 */
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
    const raw = useId();
    const id = (name: string) => `xb${raw.replace(/:/g, "")}-${name}`;

    return (
        <svg
            viewBox="14 6 172 172"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("size-8 shrink-0 text-primary", className)}
            {...props}
        >
            <title>Xboard</title>
            <defs>
                {/* Cuts the planet where the front of the ring passes over it. */}
                <mask
                    id={id("planet")}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width="200"
                    height="200"
                >
                    <rect width="200" height="200" fill="#fff" />
                    <path
                        d={FRONT}
                        transform={ORBIT}
                        fill="none"
                        stroke="#000"
                        strokeWidth="22"
                    />
                </mask>
                {/* Hides the back of the ring behind the planet. */}
                <mask
                    id={id("ring")}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width="200"
                    height="200"
                >
                    <rect width="200" height="200" fill="#fff" />
                    <circle cx="100" cy="100" r="52" fill="#000" />
                </mask>
            </defs>
            <circle
                cx="100"
                cy="100"
                r="46"
                fill="currentColor"
                mask={`url(#${id("planet")})`}
            />
            <g
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
            >
                <path d={BACK} transform={ORBIT} mask={`url(#${id("ring")})`} />
                <path d={FRONT} transform={ORBIT} />
            </g>
            <circle cx="152" cy="46" r="9" fill="#FF7A45" />
        </svg>
    );
}
