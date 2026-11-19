import { readOperationalGroup } from "../system/settings";
import { captchaPublicSchema } from "@xboard/contracts";
import { Router } from "express";
import { publicSite, readSettings } from "./service";

export const siteRoutes = Router();

siteRoutes.get("/site", async (_req, res) => {
    res.json(publicSite(await readSettings()));
});

siteRoutes.get("/site/captcha", async (_req, res) => {
    const { captchaSecretKeySet: _, ...settings } =
        await readOperationalGroup("captcha");
    res.json(captchaPublicSchema.parse(settings));
});
