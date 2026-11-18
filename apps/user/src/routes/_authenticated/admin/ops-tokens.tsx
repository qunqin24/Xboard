import { createFileRoute } from "@tanstack/react-router";
import { AdminOpsTokens } from "@/features/admin/ops-tokens";

export const Route = createFileRoute("/_authenticated/admin/ops-tokens")({
    component: AdminOpsTokens,
});
