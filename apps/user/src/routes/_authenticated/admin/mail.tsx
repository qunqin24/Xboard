import { createFileRoute } from "@tanstack/react-router";
import { AdminMail } from "@/features/admin/records";

export const Route = createFileRoute("/_authenticated/admin/mail")({
    component: AdminMail,
});
