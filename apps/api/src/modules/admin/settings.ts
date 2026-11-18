import { Router } from "express";
import { settingsBody } from "@xboard/contracts";
import { db } from "../../db";
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { readSettings, writeSettings } from "../site/service";
import { audit } from "./shared";

export const settingsRoutes = Router();

settingsRoutes.get("/settings", async (_req, res) => {
    res.json(await readSettings());
});

settingsRoutes.put("/settings", async (req, res) => {
    const next = parse(settingsBody, req.body);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
        const before = await readSettings(tx);
        await writeSettings(tx, next);
        await audit(tx, actor.id, "settings.update", "site", {
            before,
            after: next,
        });
    });
    res.json(next);
});
