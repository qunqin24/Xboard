import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignUp } from "@/features/auth/sign-up";

// Hidden behind a notice when registration is closed in site settings.
// `?invite=CODE` comes from a user's invite link and fills the invite field.
export const Route = createFileRoute("/(auth)/sign-up")({
    validateSearch: z.object({
        invite: z.string().max(16).optional().catch(undefined),
    }),
    component: SignUp,
});
