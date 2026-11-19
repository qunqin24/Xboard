import { type QueryClient } from "@tanstack/react-query";
import {
    createRootRouteWithContext,
    Outlet,
    redirect,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { setupQuery } from "@/features/auth/setup";
import { GeneralError } from "@/features/errors/general-error";
import { NotFoundError } from "@/features/errors/not-found-error";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
    {
        beforeLoad: async ({ context, location }) => {
            const needsSetup = await context.queryClient.fetchQuery(setupQuery);
            if (needsSetup && location.pathname !== "/setup")
                throw redirect({ to: "/setup", replace: true });
            if (!needsSetup && location.pathname === "/setup")
                throw redirect({ to: "/sign-in", replace: true });
        },
        component: () => (
            <>
                <Outlet />
                <Toaster />
            </>
        ),
        notFoundComponent: NotFoundError,
        errorComponent: GeneralError,
    },
);
