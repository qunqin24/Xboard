import {
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
    Outlet,
    redirect,
} from "@tanstack/react-router";
import { ApiError } from "@xboard/api-client";
import { accountQuery } from "./api/hooks";
import { AccountPage } from "./pages/AccountPage";
import { LoginPage } from "./pages/LoginPage";
import { AppShell } from "./components/AppShell";
import { Button, Notice } from "./components/primitives";
import { queryClient } from "./query-client";

const rootRoute = createRootRoute({
    component: Outlet,
    notFoundComponent: () => (
        <AppShell>
            <Notice
                title="这个页面不存在"
                action={
                    <Button variant="secondary" onClick={() => history.back()}>
                        返回上一页
                    </Button>
                }
            >
                链接可能已失效，或地址输入有误。
            </Notice>
        </AppShell>
    ),
});

async function authenticated() {
    try {
        return await queryClient.fetchQuery(accountQuery);
    } catch (error) {
        if (error instanceof ApiError && error.status === 401)
            throw redirect({ to: "/login" });
        throw error;
    }
}

const accountRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: AccountPage,
    beforeLoad: async () => {
        try {
            await queryClient.ensureQueryData(accountQuery);
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                throw redirect({ to: "/login" });
            }
        }
    },
});

const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPage,
    beforeLoad: async () => {
        try {
            await queryClient.ensureQueryData(accountQuery);
        } catch {
            return;
        }
        throw redirect({ to: "/" });
    },
});

const manageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/manage",
    component: lazyRouteComponent(
        () => import("./pages/ManagePage"),
        "ManagePage",
    ),
    beforeLoad: authenticated,
});

const recoverRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/recover",
    component: lazyRouteComponent(
        () => import("./pages/RecoverPage"),
        "RecoverPage",
    ),
});

// The admin console has its own layout and one URL per function. The API
// enforces the admin role on every request; this guard only avoids rendering
// an unusable console for regular accounts.
const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    component: lazyRouteComponent(
        () => import("./admin/AdminLayout"),
        "AdminLayout",
    ),
    beforeLoad: async () => {
        const account = await authenticated();
        if (account.role !== "admin") throw redirect({ to: "/" });
    },
});

// Generic over the path so links to admin pages stay type-checked.
const adminPage = <
    TPath extends string,
    TModule extends Record<string, unknown>,
>(
    path: TPath,
    load: () => Promise<TModule>,
    name: keyof TModule & string,
) =>
    createRoute({
        getParentRoute: () => adminRoute,
        path,
        component: lazyRouteComponent(load, name),
    });

const adminOverview = adminPage(
    "/",
    () => import("./admin/OverviewPage"),
    "OverviewPage",
);
const adminPlans = adminPage(
    "plans",
    () => import("./admin/PlansPage"),
    "PlansPage",
);
const adminNodes = adminPage(
    "nodes",
    () => import("./admin/NodesPage"),
    "NodesPage",
);
const adminUsers = adminPage(
    "users",
    () => import("./admin/UsersPage"),
    "UsersPage",
);
const adminOrders = adminPage(
    "orders",
    () => import("./admin/RecordPages"),
    "OrdersPage",
);
const adminLedger = adminPage(
    "ledger",
    () => import("./admin/RecordPages"),
    "LedgerPage",
);
const adminAudit = adminPage(
    "audit",
    () => import("./admin/RecordPages"),
    "AuditPage",
);
const adminMail = adminPage(
    "mail",
    () => import("./admin/RecordPages"),
    "MailPage",
);
const adminNotices = adminPage(
    "notices",
    () => import("./admin/ContentPages"),
    "NoticesPage",
);
const adminTickets = adminPage(
    "tickets",
    () => import("./admin/ContentPages"),
    "TicketsPage",
);

export const router = createRouter({
    routeTree: rootRoute.addChildren([
        accountRoute,
        loginRoute,
        manageRoute,
        recoverRoute,
        adminRoute.addChildren([
            adminOverview,
            adminPlans,
            adminNodes,
            adminUsers,
            adminOrders,
            adminLedger,
            adminAudit,
            adminMail,
            adminNotices,
            adminTickets,
        ]),
    ]),
    defaultPreload: "intent",
    scrollRestoration: true,
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
