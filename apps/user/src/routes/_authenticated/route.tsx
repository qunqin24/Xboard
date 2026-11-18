import { createFileRoute, redirect } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { accountQuery } from "@/api/hooks";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";
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
    // The router applies the same rule as the rest of the app: nothing for
    // 300 ms, then the shell, held for at least 500 ms.
    pendingMs: 300,
    pendingMinMs: 500,
    pendingComponent: ShellSkeleton,
    component: AuthenticatedLayout,
});
