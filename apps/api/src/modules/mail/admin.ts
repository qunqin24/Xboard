import { db } from "../../db";
import { localeQuery } from "@xboard/contracts";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import {
    broadcastBody,
    mailTemplateBody,
    mailTemplateKey,
} from "@xboard/contracts";
import { badRequest, conflict } from "../../http/errors";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";
import {
    readTemplates,
    storedTemplateKey,
    validateTemplate,
} from "./templates";
import { adminActorId, adminRead, adminWrite } from "../admin/operations";
import { getSmtpConfig } from "../system/settings";

export const adminMailRoutes = Router();

adminMailRoutes.get(
    "/mail/templates",
    adminRead(async (req) => {
        const { locale } = parse(localeQuery, req.query);
        return await readTemplates(mailTemplateKey.options, db, locale);
    }),
);

adminMailRoutes.put(
    "/mail/templates/:key",
    adminWrite(200, async (req, tx) => {
        const key = parse(mailTemplateKey, req.params.key);
        const { locale = "zh-CN" } = parse(localeQuery, req.query);
        const storageKey = storedTemplateKey(key, locale);
        const data = parse(mailTemplateBody, req.body);
        validateTemplate(key, data);
        await tx.mailTemplate.upsert({
            where: { key: storageKey },
            create: { key: storageKey, ...data },
            update: data,
        });
        await audit(tx, adminActorId(req), "mail.template_save", storageKey);
        return { ok: true };
    }),
);

adminMailRoutes.post(
    "/mail/broadcast",
    adminWrite(
        201,
        async (req, tx) => {
            const { requestId, subject, text, ...target } = parse(
                broadcastBody,
                req.body,
            );
            const actorId = adminActorId(req);
            const ids =
                target.scope === "selected"
                    ? [...target.ids].sort((a, b) => a - b)
                    : null;
            const digest = createHash("sha256")
                .update(JSON.stringify([subject, text, ids]))
                .digest("hex");
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
                return { recipients: prior.recipients };
            }
            if (!(await getSmtpConfig(tx)))
                throw badRequest("请先配置邮件服务。");
            const recipients = await tx.$executeRaw`
            INSERT INTO "Mail" ("to", subject, text)
            SELECT email, ${subject}, ${text} FROM "User"
            WHERE NOT banned AND ${ids === null ? Prisma.sql`TRUE` : Prisma.sql`id = ANY(${ids}::int[])`}
            ORDER BY id`;
            if (!recipients) throw badRequest("没有符合条件的收件人。");
            await tx.mailBroadcast.update({
                where: { requestId },
                data: { recipients },
            });
            await audit(tx, actorId, "mail.broadcast", requestId, {
                scope: target.scope,
                recipients,
            });
            return { recipients };
        },
        { timeout: 30_000 },
    ),
);
