import { createFileRoute } from "@tanstack/react-router";
import { Records } from "@/features/user/records";

export const Route = createFileRoute("/_authenticated/records")({
    component: Records,
});
