import { ShieldCheck } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useSite } from "../api/panel";
import { ThemeToggle } from "./chrome";
import { BrandMark } from "./primitives";

/** Centered single-card layout for sign-in, registration and recovery. */
export function AuthLayout({
    title,
    description,
    headerAction,
    children,
}: {
    title: string;
    description: string;
    headerAction?: ReactNode;
    children: ReactNode;
}) {
    const site = useSite();
    return (
        <div className="flex min-h-dvh flex-col bg-paper text-ink">
            <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
                <Link to="/login" className="flex items-center gap-2.5">
                    <BrandMark />
                    <span className="text-sm font-semibold tracking-tight">
                        {site.data?.siteName ?? "Xboard"}
                    </span>
                </Link>
                <div className="flex items-center gap-3">
                    {headerAction}
                    <ThemeToggle />
                </div>
            </header>

            <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
                <div className="w-full max-w-[380px]">
                    <div className="mb-8">
                        <h1 className="text-2xl font-semibold tracking-tight text-ink">
                            {title}
                        </h1>
                        <p className="mt-1.5 text-sm text-ink-muted">
                            {description}
                        </p>
                    </div>
                    {children}
                    <p className="mt-8 flex items-center gap-1.5 text-xs text-ink-subtle">
                        <ShieldCheck aria-hidden className="size-3.5" />
                        会话仅保存在 HttpOnly Cookie，密码加盐哈希存储
                    </p>
                </div>
            </main>
        </div>
    );
}
