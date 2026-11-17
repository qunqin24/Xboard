import { createFileRoute } from "@tanstack/react-router";
import { Recover } from "@/features/auth/recover";

// Landing page for /recover#verify:<token> and /recover#reset:<token> email links.
export const Route = createFileRoute("/(auth)/recover")({ component: Recover });
