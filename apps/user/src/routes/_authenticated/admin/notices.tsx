import { createFileRoute } from "@tanstack/react-router";
import { editorSearchSchema } from "@/features/admin/editor-search";
import { AdminNotices } from "@/features/admin/notices";

export const Route = createFileRoute("/_authenticated/admin/notices")({
    validateSearch: editorSearchSchema,
    component: AdminNotices,
});
