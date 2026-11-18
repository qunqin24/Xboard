import { createFileRoute } from "@tanstack/react-router";
import { AdminPromotions } from "@/features/admin/promotions";

export const Route = createFileRoute("/_authenticated/admin/promotions")({
    component: AdminPromotions,
});
