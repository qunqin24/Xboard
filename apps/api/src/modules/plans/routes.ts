import { Router } from "express";
import { requireUser } from "../../http/session";
import { listPlans } from "./service";

export const planRoutes = Router();

planRoutes.get("/plans", requireUser, async (_req, res) => {
    res.json(await listPlans());
});
