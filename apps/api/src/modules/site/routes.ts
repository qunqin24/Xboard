import { Router } from "express";
import { readSettings } from "./service";

export const siteRoutes = Router();

siteRoutes.get("/site", async (_req, res) => {
    res.json(await readSettings());
});
