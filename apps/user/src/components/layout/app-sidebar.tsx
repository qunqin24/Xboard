import { useLayout } from "@/context/layout-provider";
import { useWorkspace } from "@/hooks/use-workspace";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar";
import { NavGroup } from "./nav-group";
import { NavUser } from "./nav-user";
import { TeamSwitcher } from "./team-switcher";

export function AppSidebar() {
    const { collapsible, variant } = useLayout();
    const { navGroups } = useWorkspace();
    return (
        <Sidebar collapsible={collapsible} variant={variant}>
            <SidebarHeader>
                <TeamSwitcher />
            </SidebarHeader>
            <SidebarContent>
                {navGroups.map((props) => (
                    <NavGroup key={props.title} {...props} />
                ))}
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
