import { createFileRoute } from "@tanstack/react-router";
import { editorSearchSchema } from "@/features/admin/editor-search";
import { AdminNodes } from "@/features/admin/nodes";

export const Route = createFileRoute("/_authenticated/admin/nodes")({
    validateSearch: editorSearchSchema,
    component: AdminNodes,
});
