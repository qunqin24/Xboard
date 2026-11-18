import { Router } from "express";
import { helpBody, idParam } from "@xboard/contracts";
import { db } from "../../db";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";

export const helpRoutes = Router();
export const adminHelpRoutes = Router();
const orderBy = [{ sort: "asc" }, { id: "asc" }] as const;

helpRoutes.get("/help", requireUser, async (_req, res) => {
    res.json(
        await db.helpArticle.findMany({
            where: { published: true },
            orderBy: [...orderBy],
        }),
    );
});

adminHelpRoutes.get("/help", async (_req, res) => {
    res.json(await db.helpArticle.findMany({ orderBy: [...orderBy] }));
});

adminHelpRoutes.post("/help", async (req, res) => {
    const data = parse(helpBody, req.body);
    const article = await db.$transaction(async (tx) => {
        const row = await tx.helpArticle.create({ data });
        await audit(tx, currentUser(req).id, "help.create", row.id, {
            title: row.title,
            published: row.published,
        });
        return row;
    });
    res.status(201).json(article);
});

adminHelpRoutes.put("/help/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    const data = parse(helpBody, req.body);
    const article = await db.$transaction(async (tx) => {
        const row = await tx.helpArticle.update({ where: { id }, data });
        await audit(tx, currentUser(req).id, "help.update", id, {
            title: row.title,
            published: row.published,
        });
        return row;
    });
    res.json(article);
});

adminHelpRoutes.delete("/help/:id", async (req, res) => {
    const id = parse(idParam, req.params.id);
    await db.$transaction(async (tx) => {
        await tx.helpArticle.delete({ where: { id } });
        await audit(tx, currentUser(req).id, "help.delete", id);
    });
    res.json({ ok: true });
});
