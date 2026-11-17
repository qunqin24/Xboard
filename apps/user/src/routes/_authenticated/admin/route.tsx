import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ForbiddenError } from "@/features/errors/forbidden";

// The API enforces the admin role on every request; this only spares regular
// accounts an unusable console by showing 403 instead.
export const Route = createFileRoute("/_authenticated/admin")({
    component: function AdminGate() {
        const { account } = Route.useRouteContext();
        return account.role === "admin" ? <Outlet /> : <ForbiddenError />;
    },
});
