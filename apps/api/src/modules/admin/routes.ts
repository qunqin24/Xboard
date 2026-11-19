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
import { localeAdminRoutes } from "../site/locale";
import { telegramAdminRoutes } from "../telegram/routes";
import { commissionAdminRoutes } from "../commission/routes";
import { paymentAdminRoutes } from "../payments/routes";
import { systemAdminRoutes } from "../system/admin";

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
adminRoutes.use(
    requireAdmin,
    adminOperations,
    opsTokenRoutes,
    systemAdminRoutes,
    paymentAdminRoutes,
    commissionAdminRoutes,
    telegramAdminRoutes,
    localeAdminRoutes,
);
