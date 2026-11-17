import { createFileRoute } from "@tanstack/react-router";
import { SignUp } from "@/features/auth/sign-up";

// Hidden behind a notice when registration is closed in site settings.
export const Route = createFileRoute("/(auth)/sign-up")({ component: SignUp });
