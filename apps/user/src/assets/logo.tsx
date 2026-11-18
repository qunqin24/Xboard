import { useId, type SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Xboard app icon: stacked subscription cards, the front one marked with an X.
 * Mirrors `public/favicon.svg`; ids are scoped per instance so several logos
 * can render on one page.
 */
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
    const raw = useId();
    const id = (name: string) => `xb${raw.replace(/:/g, "")}-${name}`;
    const url = (name: string) => `url(#${id(name)})`;

    return (
        <svg
            viewBox="4 4 120 120"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("size-8 shrink-0", className)}
            {...props}
        >
            <title>Xboard</title>
            <defs>
                <clipPath id={id("tile")}>
                    <rect x="4" y="4" width="120" height="120" rx="27" />
                </clipPath>
                <filter
                    id={id("blur")}
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                >
                    <feGaussianBlur stdDeviation="4" />
                </filter>
                <linearGradient id={id("bg")} x1="0" y1="0" x2=".3" y2="1">
                    <stop offset="0" stopColor="#5ec2ff" />
                    <stop offset="1" stopColor="#1a56f0" />
                </linearGradient>
                <linearGradient id={id("back")} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ff9a6b" />
                    <stop offset="1" stopColor="#ff4f7b" />
                </linearGradient>
                <linearGradient id={id("mid")} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#b59bff" />
                    <stop offset="1" stopColor="#6c4dff" />
                </linearGradient>
                <linearGradient id={id("front")} x1="0" y1="0" x2=".6" y2="1">
                    <stop offset="0" stopColor="#fff" />
                    <stop offset="1" stopColor="#dfe8ff" />
                </linearGradient>
                <linearGradient id={id("x")} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4a8bff" />
                    <stop offset="1" stopColor="#2440e8" />
                </linearGradient>
            </defs>
            <g clipPath={url("tile")}>
                <rect x="4" y="4" width="120" height="120" fill={url("bg")} />
                <path d="M4 4h120v42Q64 24 4 54z" fill="#fff" opacity=".12" />
                <rect
                    x="28"
                    y="30"
                    width="70"
                    height="48"
                    rx="11"
                    transform="rotate(-18 63 54)"
                    fill={url("back")}
                />
                <rect
                    x="28"
                    y="38"
                    width="70"
                    height="48"
                    rx="11"
                    transform="rotate(-8 63 62)"
                    fill={url("mid")}
                />
                <rect
                    x="30"
                    y="58"
                    width="74"
                    height="52"
                    rx="12"
                    fill="#0a2a8a"
                    opacity=".45"
                    filter={url("blur")}
                />
                <rect
                    x="27"
                    y="50"
                    width="74"
                    height="52"
                    rx="12"
                    fill={url("front")}
                />
                <rect
                    x="27.5"
                    y="50.5"
                    width="73"
                    height="51"
                    rx="11.5"
                    fill="none"
                    stroke="#fff"
                />
                <g transform="translate(46 76)" fill={url("x")}>
                    <rect
                        x="-14"
                        y="-4.5"
                        width="28"
                        height="9"
                        rx="4.5"
                        transform="rotate(45)"
                    />
                    <rect
                        x="-14"
                        y="-4.5"
                        width="28"
                        height="9"
                        rx="4.5"
                        transform="rotate(-45)"
                    />
                </g>
                <rect
                    x="64"
                    y="68"
                    width="26"
                    height="6"
                    rx="3"
                    fill="#b9c8ef"
                />
                <rect
                    x="64"
                    y="79"
                    width="18"
                    height="6"
                    rx="3"
                    fill="#d3ddf6"
                />
                <path
                    d="M102 20l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z"
                    fill="#fff"
                />
                <circle cx="88" cy="40" r="2" fill="#fff" opacity=".8" />
            </g>
            <rect
                x="4.5"
                y="4.5"
                width="119"
                height="119"
                rx="26.5"
                fill="none"
                stroke="#fff"
                strokeOpacity=".2"
            />
        </svg>
    );
}
