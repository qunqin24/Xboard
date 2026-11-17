import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ConfigDrawer } from "@/components/config-drawer";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { Search } from "@/components/search";
import { ThemeSwitch } from "@/components/theme-switch";
import { Header } from "./header";
import { Main } from "./main";

/**
 * The header + main + title block every upstream feature page repeats:
 * search, theme switch, layout drawer and profile menu on top, then the page.
 */
export function Page({
    title,
    description,
    actions,
    children,
    fixed = false,
    className,
}: {
    title: string;
    description?: ReactNode;
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
                className={cn("flex flex-1 flex-col gap-4 sm:gap-6", className)}
            >
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">
                            {title}
                        </h2>
                        {description ? (
                            <p className="text-muted-foreground">
                                {description}
                            </p>
                        ) : null}
                    </div>
                    {actions ? (
                        <div className="flex flex-wrap gap-2">{actions}</div>
                    ) : null}
                </div>
                {children}
            </Main>
        </>
    );
}
