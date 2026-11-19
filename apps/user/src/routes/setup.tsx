import { createFileRoute } from "@tanstack/react-router";
import { Setup } from "@/features/auth/setup";

export const Route = createFileRoute("/setup")({ component: Setup });
