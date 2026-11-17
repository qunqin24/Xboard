import { createFileRoute } from "@tanstack/react-router";
import { AdminLedger } from "@/features/admin/records";

export const Route = createFileRoute("/_authenticated/admin/ledger")({
    component: AdminLedger,
});
