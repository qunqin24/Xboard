import { Router } from "express";
import { requireAdmin } from "../../http/session";
import { catalogRoutes } from "./catalog";
import { recordRoutes } from "./records";
import { settingsRoutes } from "./settings";
import { statsRoutes } from "./stats";
import { userRoutes } from "./users";
import { adminHelpRoutes } from "../help/routes";
import { adminMailRoutes } from "../mail/admin";
import { adminPromotionRoutes } from "../promotions/routes";
import { templateRoutes } from "../templates/routes";

/** Everything under /api/admin requires an admin session. */
export const adminRoutes = Router();
adminRoutes.use(requireAdmin);
adminRoutes.use(
    userRoutes,
    catalogRoutes,
    recordRoutes,
    statsRoutes,
    settingsRoutes,
    adminHelpRoutes,
    adminPromotionRoutes,
    adminMailRoutes,
    templateRoutes,
);
