import { ShieldCheck } from "@phosphor-icons/react";
import { useAccount } from "../api/hooks";

export function AppShell({
    children,
    email,
    onLogout,
    busy,
}: {
    children: React.ReactNode;
    email?: string;
    onLogout?: () => void;
    busy?: boolean;
}) {
    const account = useAccount();
    const pathname =
        typeof window !== "undefined" ? window.location.pathname : "/";

    const navItems = [
        { href: "/", label: "账户总览" },
        { href: "/manage", label: "账户与服务" },
        ...(account.data?.role === "admin"
            ? [{ href: "/admin", label: "管理后台" }]
            : []),
    ];

    return (
        <div className="flex min-h-dvh flex-col bg-paper text-ink">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-xs"
            >
                跳到主要内容
            </a>
            <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <a
                            href="/"
                            className="flex items-center gap-2.5 text-ink transition-opacity hover:opacity-85"
                        >
                            <span
                                aria-hidden
                                className="grid size-6 place-items-center rounded-md bg-ink text-paper"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    className="size-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                    strokeLinecap="round"
                                >
                                    <path d="m6 6 12 12M18 6 6 18" />
                                </svg>
                            </span>
                            <span className="text-sm font-semibold tracking-tight">
                                Xboard
                            </span>
                        </a>
                        {account.data ? (
                            <>
                                <span
                                    aria-hidden
                                    className="text-sm text-line-strong"
                                >
                                    /
                                </span>
                                <span className="rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-xs text-ink-muted">
                                    {account.data.plan?.name ?? "未开通套餐"}
                                </span>
                            </>
                        ) : null}
                        {import.meta.env.DEV ? (
                            <span className="hidden rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent sm:inline-block">
                                DEV
                            </span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                        {email ? (
                            <span className="hidden text-xs text-ink-muted sm:inline">
                                {email}
                            </span>
                        ) : null}
                        {onLogout ? (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onLogout}
                                className="rounded-md border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-subtle disabled:opacity-50"
                            >
                                {busy ? "正在退出…" : "退出登录"}
                            </button>
                        ) : null}
                    </div>
                </div>
                {account.data ? (
                    <nav
                        aria-label="主导航"
                        className="mx-auto flex max-w-6xl gap-6 px-6 text-xs"
                    >
                        {navItems.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    className={`border-b-2 pb-3 pt-1 font-medium transition-colors ${
                                        active
                                            ? "border-ink text-ink"
                                            : "border-transparent text-ink-muted hover:text-ink"
                                    }`}
                                >
                                    {item.label}
                                </a>
                            );
                        })}
                    </nav>
                ) : null}
            </header>
            <main
                id="main"
                className="mx-auto w-full max-w-6xl flex-1 px-6 py-8"
            >
                {children}
            </main>
            <footer className="border-t border-line-subtle">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-2">
                        <ShieldCheck aria-hidden className="size-4" />
                        <span>Xboard 用户中心</span>
                    </span>
                    <span className="numeric text-ink-subtle">
                        Subscription Console
                    </span>
                </div>
            </footer>
        </div>
    );
}
