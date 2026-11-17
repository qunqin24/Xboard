import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, LayoutGrid, ShieldCheck } from "lucide-react";
import { useAccount } from "@/api/hooks";
import { useSite } from "@/api/panel";
import { useWorkspace, type Workspace } from "@/hooks/use-workspace";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";

const WORKSPACES: Record<
    Workspace,
    { label: string; to: "/" | "/admin"; icon: React.ElementType }
> = {
    user: { label: "用户中心", to: "/", icon: LayoutGrid },
    admin: { label: "管理后台", to: "/admin", icon: ShieldCheck },
};

/**
 * Upstream's team switcher, repurposed to switch between the user centre and
 * the admin console. Regular accounts only see the user centre.
 */
export function TeamSwitcher() {
    const { isMobile } = useSidebar();
    const { workspace } = useWorkspace();
    const account = useAccount();
    const site = useSite();
    const current = WORKSPACES[workspace];
    const available = (Object.keys(WORKSPACES) as Workspace[]).filter(
        (key) => key === "user" || account.data?.role === "admin",
    );

    const header = (
        <>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <current.icon className="size-4" />
            </div>
            <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">
                    {site.data?.siteName ?? "Xboard"}
                </span>
                <span className="truncate text-xs">{current.label}</span>
            </div>
        </>
    );

    if (available.length < 2)
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" asChild>
                        <Link to="/">{header}</Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        );

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            {header}
                            <ChevronsUpDown className="ms-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        align="start"
                        side={isMobile ? "bottom" : "right"}
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                            切换到
                        </DropdownMenuLabel>
                        {available.map((key) => {
                            const item = WORKSPACES[key];
                            return (
                                <DropdownMenuItem
                                    key={key}
                                    asChild
                                    className="gap-2 p-2"
                                >
                                    <Link to={item.to}>
                                        <div className="flex size-6 items-center justify-center rounded-sm border">
                                            <item.icon className="size-4 shrink-0" />
                                        </div>
                                        {item.label}
                                        {key === workspace ? (
                                            <Check className="ms-auto size-4" />
                                        ) : null}
                                    </Link>
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
