import { createFileRoute, redirect } from "@tanstack/react-router";

// Old path kept for bookmarks; the sign-in page now lives at /sign-in.
export const Route = createFileRoute("/login")({
    beforeLoad: () => {
        throw redirect({ to: "/sign-in", replace: true });
    },
});
