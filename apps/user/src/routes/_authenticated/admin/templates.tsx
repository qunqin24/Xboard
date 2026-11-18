import { createFileRoute } from "@tanstack/react-router";
import { AdminTemplates } from "@/features/admin/templates";

export const Route = createFileRoute("/_authenticated/admin/templates")({
    component: AdminTemplates,
});
