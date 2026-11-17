import { GearSix, SignOut } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAccount, useLogout } from "../api/hooks";
import { useSite } from "../api/panel";
import { ThemeToggle } from "./chrome";
import { BrandMark } from "./primitives";

const navLink =
    "relative py-3.5 text-sm text-ink-muted transition-colors hover:text-ink data-[status=active]:font-medium data-[status=active]:text-ink data-[status=active]:after:absolute data-[status=active]:after:inset-x-0 data-[status=active]:after:-bottom-px data-[status=active]:after:h-0.5 data-[status=active]:after:rounded-full data-[status=active]:after:bg-ink";

export function AppShell({ children }: { children: ReactNode }) {
    const account = useAccount();
    const logout = useLogout();
    const navigate = useNavigate();
    const signedIn = account.isSuccess;
    const site = useSite();

    return (
        <div className="flex min-h-dvh flex-col bg-paper text-ink">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-xs"
            >
                跳到主要内容
            </a>
            <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
                <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
                    <Link to="/" className="flex items-center gap-2.5">
                        <BrandMark />
                        <span className="text-sm font-semibold tracking-tight">
                            {site.data?.siteName ?? "Xboard"}
                        </span>
                        {import.meta.env.DEV ? (
                            <span className="rounded border border-line px-1.5 text-[11px] font-medium text-ink-subtle">
                                DEV
                            </span>
                        ) : null}
                    </Link>
                    {signedIn ? (
                        <div className="flex items-center gap-1">
                            <span className="mr-2 hidden max-w-56 truncate text-xs text-ink-muted sm:inline">
                                {account.data.email}
                            </span>
                            {account.data.role === "admin" ? (
                                <Link
                                    to="/admin"
                                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink shadow-card transition-colors hover:border-line-strong"
                                >
                                    <GearSix aria-hidden className="size-3.5" />
                                    管理后台
                                </Link>
                            ) : null}
                            <ThemeToggle />
                            <button
                                type="button"
                                aria-label="退出登录"
                                title="退出登录"
                                disabled={logout.isPending}
                                onClick={async () => {
                                    try {
                                        await logout.mutateAsync();
                                        await navigate({ to: "/login" });
                                    } catch {
                                        /* Error is shown below the header. */
                                    }
                                }}
                                className="grid size-8 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:opacity-50"
                            >
                                <SignOut aria-hidden className="size-4" />
                            </button>
                        </div>
                    ) : null}
                </div>
                {signedIn ? (
                    <nav
                        aria-label="主导航"
                        className="mx-auto flex max-w-5xl gap-6 px-4 sm:px-6"
                    >
                        <Link
                            to="/"
                            activeOptions={{ exact: true }}
                            className={navLink}
                        >
                            总览
                        </Link>
                        <Link to="/manage" className={navLink}>
                            账户与服务
                        </Link>
                    </nav>
                ) : null}
            </header>
            {logout.isError ? (
                <p
                    role="alert"
                    className="bg-danger-soft px-6 py-2 text-center text-xs text-danger"
                >
                    {logout.error.message}
                </p>
            ) : null}
            <main
                id="main"
                className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10"
            >
                {children}
            </main>
            <footer className="border-t border-line-subtle">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 text-xs text-ink-subtle sm:px-6">
                    <span>Xboard 用户中心</span>
                    <span>需要帮助？在账户与服务页提交工单</span>
                </div>
            </footer>
        </div>
    );
}
