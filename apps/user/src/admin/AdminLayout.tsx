import {
    ArrowLeft,
    ChatsCircle,
    ClipboardText,
    EnvelopeSimple,
    HardDrives,
    List,
    Megaphone,
    Package,
    Receipt,
    SignOut,
    SquaresFour,
    Users,
    Wallet,
    X,
    type Icon,
} from "@phosphor-icons/react";
import {
    Link,
    Outlet,
    useNavigate,
    useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAccount, useLogout } from "../api/hooks";
import { usePanel } from "../api/panel";
import { BrandMark } from "../components/primitives";
import type { Overview } from "./types";

type NavItem = {
    to:
        | "/admin"
        | "/admin/plans"
        | "/admin/nodes"
        | "/admin/users"
        | "/admin/orders"
        | "/admin/ledger"
        | "/admin/notices"
        | "/admin/tickets"
        | "/admin/audit"
        | "/admin/mail";
    label: string;
    icon: Icon;
    exact?: boolean;
};

const NAV: { label: string; items: NavItem[] }[] = [
    {
        label: "运营",
        items: [
            { to: "/admin", label: "概览", icon: SquaresFour, exact: true },
        ],
    },
    {
        label: "商品",
        items: [
            { to: "/admin/plans", label: "套餐", icon: Package },
            { to: "/admin/nodes", label: "节点", icon: HardDrives },
        ],
    },
    {
        label: "用户与财务",
        items: [
            { to: "/admin/users", label: "用户", icon: Users },
            { to: "/admin/orders", label: "订单", icon: Receipt },
            { to: "/admin/ledger", label: "余额流水", icon: Wallet },
        ],
    },
    {
        label: "内容与支持",
        items: [
            { to: "/admin/notices", label: "公告", icon: Megaphone },
            { to: "/admin/tickets", label: "工单", icon: ChatsCircle },
        ],
    },
    {
        label: "系统",
        items: [
            { to: "/admin/audit", label: "审计日志", icon: ClipboardText },
            { to: "/admin/mail", label: "邮件队列", icon: EnvelopeSimple },
        ],
    },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
    const account = useAccount();
    const overview = usePanel<Overview>("/admin/overview");
    const logout = useLogout();
    const navigate = useNavigate();

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
                <BrandMark />
                <span className="text-sm font-semibold tracking-tight">
                    Xboard
                </span>
                <span className="rounded border border-line bg-surface px-1.5 py-px text-[11px] font-medium text-ink-muted">
                    管理后台
                </span>
            </div>

            <nav
                aria-label="后台导航"
                className="flex-1 space-y-5 overflow-y-auto px-3 py-3"
            >
                {NAV.map((group) => (
                    <div key={group.label}>
                        <p className="px-2 pb-1.5 text-[11px] font-medium text-ink-subtle">
                            {group.label}
                        </p>
                        <ul className="space-y-0.5">
                            {group.items.map((item) => (
                                <li key={item.to}>
                                    <Link
                                        to={item.to}
                                        onClick={onNavigate}
                                        activeOptions={{
                                            exact: item.exact ?? false,
                                            includeSearch: false,
                                        }}
                                        className="group flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink data-[status=active]:border-line data-[status=active]:bg-surface data-[status=active]:font-medium data-[status=active]:text-ink data-[status=active]:shadow-card"
                                    >
                                        <item.icon
                                            aria-hidden
                                            className="size-4 shrink-0"
                                        />
                                        <span className="flex-1">
                                            {item.label}
                                        </span>
                                        {item.to === "/admin/tickets" &&
                                        overview.data?.openTickets ? (
                                            <span className="numeric rounded-full bg-ink px-1.5 text-[11px] leading-[18px] text-paper">
                                                {overview.data.openTickets}
                                            </span>
                                        ) : null}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>

            <div className="shrink-0 space-y-1 border-t border-line p-3">
                <Link
                    to="/"
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                >
                    <ArrowLeft aria-hidden className="size-4" />
                    返回用户中心
                </Link>
                <div className="flex items-center justify-between gap-2 px-2 pt-2">
                    <span
                        className="truncate text-xs text-ink-muted"
                        title={account.data?.email}
                    >
                        {account.data?.email}
                    </span>
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
                                /* Session stays; the button can be retried. */
                            }
                        }}
                        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:opacity-50"
                    >
                        <SignOut aria-hidden className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export function AdminLayout() {
    const [open, setOpen] = useState(false);
    const pathname = useRouterState({ select: (s) => s.location.pathname });

    useEffect(() => setOpen(false), [pathname]);

    return (
        <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
            <a
                href="#admin-main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-xs"
            >
                跳到主要内容
            </a>

            <aside className="sticky top-0 hidden h-dvh border-r border-line bg-sidebar lg:block">
                <Sidebar />
            </aside>

            <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md lg:hidden">
                <div className="flex items-center gap-2.5">
                    <BrandMark />
                    <span className="text-sm font-semibold">管理后台</span>
                </div>
                <button
                    type="button"
                    aria-label={open ? "关闭菜单" : "打开菜单"}
                    aria-expanded={open}
                    onClick={() => setOpen((value) => !value)}
                    className="grid size-9 cursor-pointer place-items-center rounded-md border border-line bg-surface"
                >
                    {open ? (
                        <X aria-hidden className="size-4" />
                    ) : (
                        <List aria-hidden className="size-4" />
                    )}
                </button>
            </div>

            {open ? (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <button
                        type="button"
                        aria-label="关闭菜单"
                        className="absolute inset-0 bg-black/30"
                        onClick={() => setOpen(false)}
                    />
                    <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-sidebar">
                        <Sidebar onNavigate={() => setOpen(false)} />
                    </aside>
                </div>
            ) : null}

            <main
                id="admin-main"
                className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10"
            >
                <Outlet />
            </main>
        </div>
    );
}
