import { createFileRoute } from "@tanstack/react-router";
import { Plans } from "@/features/user/plans";

export const Route = createFileRoute("/_authenticated/plans")({
    component: Plans,
});
