import { Router } from "express";
import { requireAdmin } from "../../http/session";
import { catalogRoutes } from "./catalog";
import { recordRoutes } from "./records";
import { settingsRoutes } from "./settings";
import { statsRoutes } from "./stats";
import { userRoutes } from "./users";

/** Everything under /api/admin requires an admin session. */
export const adminRoutes = Router();
adminRoutes.use(requireAdmin);
adminRoutes.use(
    userRoutes,
    catalogRoutes,
    recordRoutes,
    statsRoutes,
    settingsRoutes,
);
