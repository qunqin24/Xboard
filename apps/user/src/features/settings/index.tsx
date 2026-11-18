import { Outlet } from "@tanstack/react-router";
import { Palette, ShieldCheck, UserCog } from "lucide-react";
import { Page } from "@/components/layout/page";
import { SidebarNav } from "./components/sidebar-nav";

const sidebarNavItems = [
    { title: "账户", href: "/settings", icon: <UserCog className="size-4" /> },
    {
        title: "安全",
        href: "/settings/security",
        icon: <ShieldCheck className="size-4" />,
    },
    {
        title: "外观",
        href: "/settings/appearance",
        icon: <Palette className="size-4" />,
    },
];

export function Settings() {
    return (
        <Page title="账户设置" fixed>
            {/* Each clipping layer keeps 4px (-mx-1 px-1) so focus rings at the
                left and right edges are not cut off; content stays aligned. */}
            <div className="-mx-1 flex flex-1 flex-col gap-page overflow-hidden px-1 lg:flex-row">
                <aside className="top-0 lg:sticky lg:w-1/5">
                    <SidebarNav items={sidebarNavItems} />
                </aside>
                <div className="-mx-1 flex overflow-y-hidden px-1 lg:flex-1">
                    <Outlet />
                </div>
            </div>
        </Page>
    );
}
