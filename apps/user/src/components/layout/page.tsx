import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ConfigDrawer } from "@/components/config-drawer";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { Search } from "@/components/search";
import { ThemeSwitch } from "@/components/theme-switch";
import { InfoTip } from "@/components/info-tip";
import { Header } from "./header";
import { Main } from "./main";

/**
 * The header + main + title block every upstream feature page repeats:
 * search, theme switch, layout drawer and profile menu on top, then the page.
 */
export function Page({
    title,
    description,
    help,
    actions,
    children,
    fixed = false,
    className,
}: {
    title: string;
    /** One short line of state (e.g. "有效期至 2026/12/12"), not instructions. */
    description?: ReactNode;
    /** Rules and background, folded behind a question-mark button. */
    help?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    fixed?: boolean;
    className?: string;
}) {
    return (
        <>
            <Header fixed>
                <Search className="me-auto" />
                <ThemeSwitch />
                <ConfigDrawer />
                <ProfileDropdown />
            </Header>
            <Main
                fixed={fixed}
                className={cn("flex flex-1 flex-col gap-page", className)}
            >
                <div className="flex flex-wrap items-end justify-between gap-group">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                            <h2 className="text-2xl font-bold tracking-tight">
                                {title}
                            </h2>
                            {help ? <InfoTip>{help}</InfoTip> : null}
                        </div>
                        {description ? (
                            <p className="text-sm text-muted-foreground">
                                {description}
                            </p>
                        ) : null}
                    </div>
                    {actions ? (
                        <div className="flex flex-wrap gap-inline">
                            {actions}
                        </div>
                    ) : null}
                </div>
                {children}
            </Main>
        </>
    );
}
