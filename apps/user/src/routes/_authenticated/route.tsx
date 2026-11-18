import { createFileRoute, redirect } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { accountQuery } from "@/api/hooks";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";

// Every page behind the sidebar needs a live session; the cookie is HttpOnly,
// so the account endpoint is the source of truth. Only the first page waits
// for it: later navigations (opening a sheet changes the URL too) reuse the
// cached account, and a session that expires meanwhile is caught by the next
// request's 401, which redirects to sign-in (see query-client.ts).
export const Route = createFileRoute("/_authenticated")({
    beforeLoad: async ({ context, location }) => {
        try {
            return {
                account:
                    await context.queryClient.ensureQueryData(accountQuery),
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
