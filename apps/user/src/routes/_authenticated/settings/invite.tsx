import { createFileRoute } from "@tanstack/react-router";
import { SettingsInvite } from "@/features/settings/invite";

export const Route = createFileRoute("/_authenticated/settings/invite")({
    component: SettingsInvite,
});
