import { createFileRoute } from "@tanstack/react-router";
import { AdminHelp } from "@/features/admin/help";

export const Route = createFileRoute("/_authenticated/admin/help")({
    component: AdminHelp,
});
