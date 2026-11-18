import { Router } from "express";
import { helpBody, idParam } from "@xboard/contracts";
import { db } from "../../db";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";
import { adminActorId, adminRead, adminWrite } from "../admin/operations";

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

adminHelpRoutes.get(
    "/help",
    adminRead(async (_req) => {
        return await db.helpArticle.findMany({ orderBy: [...orderBy] });
    }),
);

adminHelpRoutes.post(
    "/help",
    adminWrite(201, async (req, tx) => {
        const data = parse(helpBody, req.body);
        const row = await tx.helpArticle.create({ data });
        await audit(tx, adminActorId(req), "help.create", row.id, {
            title: row.title,
            published: row.published,
        });
        const article = row;
        return article;
    }),
);

adminHelpRoutes.put(
    "/help/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const data = parse(helpBody, req.body);
        const row = await tx.helpArticle.update({ where: { id }, data });
        await audit(tx, adminActorId(req), "help.update", id, {
            title: row.title,
            published: row.published,
        });
        const article = row;
        return article;
    }),
);

adminHelpRoutes.delete(
    "/help/:id",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        await tx.helpArticle.delete({ where: { id } });
        await audit(tx, adminActorId(req), "help.delete", id);
        return { ok: true };
    }),
);
