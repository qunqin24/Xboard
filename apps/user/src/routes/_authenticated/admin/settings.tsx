import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminSettings } from "@/features/admin/settings";
import { SETTINGS_SECTION_IDS } from "@/features/admin/settings-sections";

export const Route = createFileRoute("/_authenticated/admin/settings")({
    validateSearch: z.object({
        section: z.enum(SETTINGS_SECTION_IDS).optional().catch(undefined),
    }),
    component: AdminSettings,
});
