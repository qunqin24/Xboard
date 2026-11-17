import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { setTheme, THEME_LABEL, useTheme } from "../lib/theme";
import { Menu } from "./Menu";
import { Button, buttonClass } from "./primitives";

const THEME_ICON = { light: Sun, dark: Moon, system: Desktop } as const;

export function ThemeToggle({ className = "" }: { className?: string }) {
    const theme = useTheme();
    const Current = THEME_ICON[theme];
    return (
        <Menu
            align="end"
            width={160}
            entries={(["light", "dark", "system"] as const).map((value) => ({
                label: THEME_LABEL[value],
                icon: THEME_ICON[value],
                hint: theme === value ? "当前" : undefined,
                onSelect: () => setTheme(value),
            }))}
            trigger={(props) => (
                <button
                    type="button"
                    {...props}
                    aria-label={`主题：${THEME_LABEL[theme]}`}
                    title={`主题：${THEME_LABEL[theme]}`}
                    className={`grid size-8 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink ${className}`}
                >
                    <Current aria-hidden className="size-4" />
                </button>
            )}
        />
    );
}

/** Thin top bar while a route transition (lazy chunk or loader) is pending. */
export function NavProgress() {
    const pending = useRouterState({ select: (s) => s.status === "pending" });
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (!pending) {
            setVisible(false);
            return;
        }
        const timer = setTimeout(() => setVisible(true), 150);
        return () => clearTimeout(timer);
    }, [pending]);
    if (!visible) return null;
    return (
        <div
            role="progressbar"
            aria-label="页面加载中"
            className="fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden"
        >
            <div className="animate-progress h-full w-2/5 bg-ink" />
        </div>
    );
}

function ErrorScreen({
    code,
    title,
    children,
    actions,
}: {
    code: string;
    title: string;
    children: ReactNode;
    actions: ReactNode;
}) {
    return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-16 text-center">
            <p className="numeric text-6xl font-medium tracking-tight text-ink-subtle">
                {code}
            </p>
            <h1 className="mt-4 text-xl font-semibold text-ink">{title}</h1>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">{children}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                {actions}
            </div>
        </div>
    );
}

export function ForbiddenPage() {
    return (
        <ErrorScreen
            code="403"
            title="没有访问权限"
            actions={
                <Link to="/" className={buttonClass()}>
                    返回用户中心
                </Link>
            }
        >
            管理后台只对管理员开放。如果你需要权限，请联系站点管理员。
        </ErrorScreen>
    );
}

export function NotFoundPage({ home = "/" }: { home?: "/" | "/admin" }) {
    return (
        <ErrorScreen
            code="404"
            title="页面不存在"
            actions={
                <>
                    <Button variant="secondary" onClick={() => history.back()}>
                        返回上一页
                    </Button>
                    <Link to={home} className={buttonClass()}>
                        {home === "/admin" ? "回到概览" : "回到首页"}
                    </Link>
                </>
            }
        >
            链接可能已失效，或地址输入有误。
        </ErrorScreen>
    );
}

export function GeneralErrorPage({ error }: { error: unknown }) {
    const router = useRouter();
    return (
        <ErrorScreen
            code="500"
            title="页面出错了"
            actions={
                <Button onClick={() => void router.invalidate()}>重试</Button>
            }
        >
            {error instanceof Error && error.message
                ? error.message
                : "加载时发生意外错误，请稍后重试。"}
        </ErrorScreen>
    );
}
