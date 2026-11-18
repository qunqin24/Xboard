import { createFileRoute, redirect } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { accountQuery } from "@/api/hooks";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";

// Every page behind the sidebar needs a live session; the cookie is HttpOnly,
// so the account endpoint is the source of truth.
export const Route = createFileRoute("/_authenticated")({
    beforeLoad: async ({ context, location }) => {
        try {
            return {
                account: await context.queryClient.fetchQuery(accountQuery),
            };
        } catch (error) {
            if (error instanceof ApiError && error.status === 401)
                throw redirect({
                    to: "/sign-in",
                    search: { redirect: location.href },
                });
            throw error;
        }
    },
    component: AuthenticatedLayout,
});
