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
import { opsTokenRoutes } from "../ops/tokens";

/** Business operations used by both authenticated transports. */
export const adminOperations = Router();
adminOperations.use(
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

/** Everything under /api/admin requires an admin session. */
export const adminRoutes = Router();
adminRoutes.use(requireAdmin, adminOperations, opsTokenRoutes);
