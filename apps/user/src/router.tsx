import {
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    redirect,
    lazyRouteComponent,
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
                    <Button onClick={() => history.back()}>返回上一页</Button>
                }
            >
                链接可能已失效，或地址输入有误。
            </Notice>
        </AppShell>
    ),
});

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

async function authenticated() {
    try {
        await queryClient.fetchQuery(accountQuery);
    } catch (error) {
        if (error instanceof ApiError && error.status === 401)
            throw redirect({ to: "/login" });
        throw error;
    }
}
const manageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/manage",
    component: lazyRouteComponent(
        () => import("./pages/ManagePage"),
        "ManagePage",
    ),
    beforeLoad: authenticated,
});
const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    component: lazyRouteComponent(
        () => import("./pages/AdminPage"),
        "AdminPage",
    ),
    beforeLoad: authenticated,
});
const recoverRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/recover",
    component: lazyRouteComponent(
        () => import("./pages/ManagePage"),
        "RecoverPage",
    ),
});

export const router = createRouter({
    routeTree: rootRoute.addChildren([
        accountRoute,
        loginRoute,
        manageRoute,
        adminRoute,
        recoverRoute,
    ]),
    defaultPreload: false,
    scrollRestoration: true,
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
