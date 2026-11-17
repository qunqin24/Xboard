import { createFileRoute } from "@tanstack/react-router";
import { AdminOrders } from "@/features/admin/records";

export const Route = createFileRoute("/_authenticated/admin/orders")({
    component: AdminOrders,
});
