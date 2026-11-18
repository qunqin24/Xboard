import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import {
    broadcastBody,
    mailTemplateBody,
    mailTemplateKey,
} from "@xboard/contracts";
import { getSmtpConfig } from "../../config";
import { db } from "../../db";
import { badRequest, conflict } from "../../http/errors";
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";
import { readTemplates, validateTemplate } from "./templates";

export const adminMailRoutes = Router();

adminMailRoutes.get("/mail/templates", async (_req, res) => {
    res.json(await readTemplates(mailTemplateKey.options));
});

adminMailRoutes.put("/mail/templates/:key", async (req, res) => {
    const key = parse(mailTemplateKey, req.params.key);
    const data = parse(mailTemplateBody, req.body);
    validateTemplate(key, data);
    await db.$transaction(async (tx) => {
        await tx.mailTemplate.upsert({
            where: { key },
            create: { key, ...data },
            update: data,
        });
        await audit(tx, currentUser(req).id, "mail.template_save", key);
    });
    res.json({ ok: true });
});

adminMailRoutes.post("/mail/broadcast", async (req, res) => {
    const { requestId, subject, text, ...target } = parse(
        broadcastBody,
        req.body,
    );
    const actorId = currentUser(req).id;
    const ids =
        target.scope === "selected"
            ? [...target.ids].sort((a, b) => a - b)
            : null;
    const digest = createHash("sha256")
        .update(JSON.stringify([subject, text, ids]))
        .digest("hex");
    const recipients = await db.$transaction(
        async (tx) => {
            const inserted = await tx.mailBroadcast.createMany({
                data: { requestId, actorId, digest, recipients: 0 },
                skipDuplicates: true,
            });
            if (!inserted.count) {
                const prior = await tx.mailBroadcast.findUniqueOrThrow({
                    where: { requestId },
                });
                if (prior.actorId !== actorId || prior.digest !== digest)
                    throw conflict("请求编号已用于另一批邮件。");
                return prior.recipients;
            }
            if (!getSmtpConfig()) throw badRequest("请先配置邮件服务。");
            const count = await tx.$executeRaw`
            INSERT INTO "Mail" ("to", subject, text)
            SELECT email, ${subject}, ${text} FROM "User"
            WHERE NOT banned AND ${ids === null ? Prisma.sql`TRUE` : Prisma.sql`id = ANY(${ids}::int[])`}
            ORDER BY id`;
            if (!count) throw badRequest("没有符合条件的收件人。");
            await tx.mailBroadcast.update({
                where: { requestId },
                data: { recipients: count },
            });
            await audit(tx, actorId, "mail.broadcast", requestId, {
                scope: target.scope,
                recipients: count,
            });
            return count;
        },
        { timeout: 30_000 },
    );
    res.status(201).json({ recipients });
});
