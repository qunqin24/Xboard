import { useLocation } from "@tanstack/react-router";
import { adminNav, userNav } from "@/components/layout/data/sidebar-data";

export type Workspace = "user" | "admin";

/** The admin console lives under /admin; everything else is the user centre. */
export function useWorkspace() {
    const pathname = useLocation({ select: (location) => location.pathname });
    const workspace: Workspace =
        pathname === "/admin" || pathname.startsWith("/admin/")
            ? "admin"
            : "user";
    return { workspace, navGroups: workspace === "admin" ? adminNav : userNav };
}
