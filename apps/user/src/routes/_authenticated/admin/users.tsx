import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminUsers } from "@/features/admin/users";

export const Route = createFileRoute("/_authenticated/admin/users")({
    validateSearch: z.object({
        user: z.coerce.number().int().positive().optional().catch(undefined),
    }),
    component: AdminUsers,
});
