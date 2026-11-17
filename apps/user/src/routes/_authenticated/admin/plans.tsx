import { createFileRoute } from "@tanstack/react-router";
import { editorSearchSchema } from "@/features/admin/editor-search";
import { AdminPlans } from "@/features/admin/plans";

export const Route = createFileRoute("/_authenticated/admin/plans")({
    validateSearch: editorSearchSchema,
    component: AdminPlans,
});
