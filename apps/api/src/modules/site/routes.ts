import { Router } from "express";
import { publicSite, readSettings } from "./service";

export const siteRoutes = Router();

siteRoutes.get("/site", async (_req, res) => {
    res.json(publicSite(await readSettings()));
});
