import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { accountQuery } from "@/api/hooks";
import { SignIn } from "@/features/auth/sign-in";
import { safeRedirect } from "@/features/auth/redirect";

export const Route = createFileRoute("/(auth)/sign-in")({
    validateSearch: z.object({ redirect: z.string().optional() }),
    // Already signed in: skip the form.
    beforeLoad: async ({ context, search }) => {
        const signedIn = await context.queryClient
            .ensureQueryData(accountQuery)
            .then(() => true)
            .catch(() => false);
        if (signedIn)
            throw redirect({
                to: safeRedirect(search.redirect),
                replace: true,
            });
    },
    component: SignIn,
});
