import {
    ArrowLeft,
    CaretRight,
    List,
    MagnifyingGlass,
    SidebarSimple,
    SignOut,
    X,
} from "@phosphor-icons/react";
import {
    Link,
    Outlet,
    useNavigate,
    useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useLogout } from "../api/hooks";
import { usePanel } from "../api/panel";
import { ForbiddenPage, ThemeToggle } from "../components/chrome";
import { Menu } from "../components/Menu";
import { useConfirm, useToast } from "../components/overlays";
import { BrandMark, Skeleton } from "../components/primitives";
import { CommandMenu } from "./CommandMenu";
import { locate, NAV } from "./nav";
import type { Overview } from "./types";

const COLLAPSE_KEY = "xboard-admin-sidebar";

function readCollapsed() {
    try {
        return localStorage.getItem(COLLAPSE_KEY) === "collapsed";
    } catch {
        return false;
    }
}

function Sidebar({
    collapsed,
    onNavigate,
}: {
    collapsed: boolean;
    onNavigate?: () => void;
}) {
    const overview = usePanel<Overview>("/admin/overview");

    return (
        <div className="flex h-full flex-col">
            <div
                className={`flex h-14 shrink-0 items-center gap-2.5 ${collapsed ? "justify-center" : "px-4"}`}
            >
                <BrandMark />
                {collapsed ? null : (
                    <>
                        <span className="text-sm font-semibold tracking-tight">
                            Xboard
                        </span>
                        <span className="rounded border border-line bg-surface px-1.5 py-px text-[11px] font-medium text-ink-muted">
                            管理后台
                        </span>
                    </>
                )}
            </div>

            <nav
                aria-label="后台导航"
                className={`flex-1 overflow-y-auto py-3 ${collapsed ? "space-y-3 px-2" : "space-y-5 px-3"}`}
            >
                {NAV.map((group, index) => (
                    <div key={group.label}>
                        {collapsed ? (
                            index > 0 ? (
                                <div
                                    aria-hidden
                                    className="mx-2 mb-3 h-px bg-line"
                                />
                            ) : null
                        ) : (
                            <p className="px-2 pb-1.5 text-[11px] font-medium text-ink-subtle">
                                {group.label}
                            </p>
                        )}
                        <ul className="space-y-0.5">
                            {group.items.map((item) => {
                                const badge =
                                    item.to === "/admin/tickets"
                                        ? overview.data?.openTickets
                                        : undefined;
                                return (
                                    <li key={item.to}>
                                        <Link
                                            to={item.to}
                                            onClick={onNavigate}
                                            title={
                                                collapsed
                                                    ? item.label
                                                    : undefined
                                            }
                                            aria-label={
                                                collapsed
                                                    ? item.label
                                                    : undefined
                                            }
                                            activeOptions={{
                                                exact: item.to === "/admin",
                                                includeSearch: false,
                                            }}
                                            className={`relative flex items-center gap-2.5 rounded-md border border-transparent py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink data-[status=active]:border-line data-[status=active]:bg-surface data-[status=active]:font-medium data-[status=active]:text-ink data-[status=active]:shadow-card ${
                                                collapsed
                                                    ? "justify-center px-0"
                                                    : "px-2"
                                            }`}
                                        >
                                            <item.icon
                                                aria-hidden
                                                className="size-4 shrink-0"
                                            />
                                            {collapsed ? (
                                                badge ? (
                                                    <span
                                                        aria-hidden
                                                        className="absolute top-1 right-1.5 size-1.5 rounded-full bg-danger"
                                                    />
                                                ) : null
                                            ) : (
                                                <>
                                                    <span className="flex-1">
                                                        {item.label}
                                                    </span>
                                                    {badge ? (
                                                        <span className="numeric rounded-full bg-ink px-1.5 text-[11px] leading-[18px] text-paper">
                                                            {badge}
                                                        </span>
                                                    ) : null}
                                                </>
                                            )}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            <div
                className={`shrink-0 border-t border-line ${collapsed ? "p-2" : "p-3"}`}
            >
                <Link
                    to="/"
                    title={collapsed ? "返回用户中心" : undefined}
                    aria-label={collapsed ? "返回用户中心" : undefined}
                    className={`flex items-center gap-2.5 rounded-md py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink ${
                        collapsed ? "justify-center" : "px-2"
                    }`}
                >
                    <ArrowLeft aria-hidden className="size-4" />
                    {collapsed ? null : "返回用户中心"}
                </Link>
            </div>
        </div>
    );
}

function UserMenu() {
    const account = useAccount();
    const logout = useLogout();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const toast = useToast();
    const email = account.data?.email ?? "";

    return (
        <Menu
            align="end"
            width={220}
            entries={[
                { heading: email },
                {
                    label: "返回用户中心",
                    icon: ArrowLeft,
                    onSelect: () => void navigate({ to: "/" }),
                },
                { separator: true },
                {
                    label: "退出登录",
                    icon: SignOut,
                    tone: "danger",
                    onSelect: async () => {
                        if (
                            !(await confirm({
                                title: "退出登录？",
                                description: "退出后需要重新输入邮箱和密码。",
                                confirmLabel: "退出",
                            }))
                        )
                            return;
                        try {
                            await logout.mutateAsync();
                            await navigate({ to: "/login" });
                        } catch (error) {
                            toast.error(
                                error instanceof Error
                                    ? error.message
                                    : "退出失败",
                            );
                        }
                    },
                },
            ]}
            trigger={(props) => (
                <button
                    type="button"
                    {...props}
                    aria-label="账户菜单"
                    className="grid size-8 cursor-pointer place-items-center rounded-full bg-ink text-xs font-medium text-paper uppercase transition-opacity hover:opacity-85"
                >
                    {email.slice(0, 1) || "?"}
                </button>
            )}
        />
    );
}

export function AdminLayout() {
    const account = useAccount();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const onPaletteChange = useCallback(
        (open: boolean) => setPaletteOpen(open),
        [],
    );
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const here = locate(pathname);

    useEffect(() => setMobileOpen(false), [pathname]);
    const title = here?.item.label;
    useEffect(() => {
        document.title = title ? `${title} · 管理后台` : "管理后台";
    }, [title]);

    const toggleCollapsed = () =>
        setCollapsed((value) => {
            try {
                localStorage.setItem(
                    COLLAPSE_KEY,
                    value ? "expanded" : "collapsed",
                );
            } catch {
                /* Preference just won't persist. */
            }
            return !value;
        });

    if (account.isPending) return <Skeleton className="m-8 h-40" />;
    if (account.data?.role !== "admin") return <ForbiddenPage />;

    return (
        <div
            className={`min-h-dvh bg-paper text-ink lg:grid ${
                collapsed
                    ? "lg:grid-cols-[60px_minmax(0,1fr)]"
                    : "lg:grid-cols-[232px_minmax(0,1fr)]"
            }`}
        >
            <a
                href="#admin-main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-xs"
            >
                跳到主要内容
            </a>

            <aside className="sticky top-0 hidden h-dvh border-r border-line bg-sidebar lg:block">
                <Sidebar collapsed={collapsed} />
            </aside>

            {mobileOpen ? (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <button
                        type="button"
                        aria-label="关闭菜单"
                        className="absolute inset-0 bg-black/30"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="animate-slide-up absolute inset-y-0 left-0 w-64 border-r border-line bg-sidebar">
                        <Sidebar
                            collapsed={false}
                            onNavigate={() => setMobileOpen(false)}
                        />
                    </aside>
                </div>
            ) : null}

            <div className="min-w-0">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper/85 px-4 backdrop-blur-md sm:px-6">
                    <button
                        type="button"
                        aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
                        aria-expanded={mobileOpen}
                        onClick={() => setMobileOpen((value) => !value)}
                        className="grid size-8 cursor-pointer place-items-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink lg:hidden"
                    >
                        {mobileOpen ? (
                            <X aria-hidden className="size-4" />
                        ) : (
                            <List aria-hidden className="size-4" />
                        )}
                    </button>
                    <button
                        type="button"
                        aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
                        title={collapsed ? "展开侧边栏" : "收起侧边栏"}
                        onClick={toggleCollapsed}
                        className="hidden size-8 cursor-pointer place-items-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink lg:grid"
                    >
                        <SidebarSimple aria-hidden className="size-4" />
                    </button>
                    <span
                        aria-hidden
                        className="hidden h-4 w-px bg-line lg:block"
                    />
                    <nav
                        aria-label="当前位置"
                        className="flex min-w-0 items-center gap-1.5 text-sm"
                    >
                        {here ? (
                            <>
                                <span className="hidden text-ink-subtle sm:inline">
                                    {here.group}
                                </span>
                                <CaretRight
                                    aria-hidden
                                    className="hidden size-3 text-ink-subtle sm:block"
                                />
                                <span
                                    aria-current="page"
                                    className="truncate font-medium text-ink"
                                >
                                    {here.item.label}
                                </span>
                            </>
                        ) : null}
                    </nav>

                    <div className="ml-auto flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setPaletteOpen(true)}
                            className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-sm text-ink-subtle shadow-card transition-colors hover:border-line-strong sm:w-56"
                        >
                            <MagnifyingGlass aria-hidden className="size-4" />
                            <span className="hidden flex-1 text-left sm:inline">
                                搜索…
                            </span>
                            <kbd className="numeric hidden rounded border border-line px-1 text-[11px] sm:inline">
                                ⌘K
                            </kbd>
                            <span className="sr-only sm:hidden">搜索</span>
                        </button>
                        <ThemeToggle />
                        <UserMenu />
                    </div>
                </header>

                <main
                    id="admin-main"
                    className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8"
                >
                    <Outlet />
                </main>
            </div>

            <CommandMenu open={paletteOpen} onOpenChange={onPaletteChange} />
        </div>
    );
}
