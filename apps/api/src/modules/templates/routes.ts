import { Router } from "express";
import {
    templateBody,
    templateFormatSchema,
    TEMPLATE_FORMATS,
    type SubscriptionTemplate,
    type TemplateFormat,
} from "@xboard/contracts";
import { db } from "../../db";
import { badRequest } from "../../http/errors";
import { parse } from "../../http/validate";
import { audit, iso } from "../admin/shared";
import { DEFAULT_TEMPLATES } from "./defaults";
import { validateTemplate } from "./service";
import { adminActorId, adminRead, adminWrite } from "../admin/operations";

/** /api/admin/subscription-templates: one editable template per client format. */
export const templateRoutes = Router();

function view(
    format: TemplateFormat,
    row: { content: string; updatedAt: Date } | null,
): SubscriptionTemplate {
    return {
        format,
        content: row?.content ?? DEFAULT_TEMPLATES[format],
        defaultContent: DEFAULT_TEMPLATES[format],
        customized: row !== null,
        updatedAt: row ? iso(row.updatedAt) : null,
    };
}

templateRoutes.get(
    "/subscription-templates",
    adminRead(async (_req) => {
        const rows = new Map(
            (await db.subscriptionTemplate.findMany()).map((row) => [
                row.format,
                row,
            ]),
        );
        return TEMPLATE_FORMATS.map((format) =>
            view(format, rows.get(format) ?? null),
        );
    }),
);

/** Saves after validation; saving the built-in text is the same as restoring it. */
templateRoutes.put(
    "/subscription-templates/:format",
    adminWrite(200, async (req, tx) => {
        const format = parse(templateFormatSchema, req.params.format);
        const { content } = parse(templateBody, req.body);
        const errors = validateTemplate(format, content);
        if (errors.length) throw badRequest(errors.join("\n"));
        const actorId = adminActorId(req);
        const row = await tx.subscriptionTemplate.upsert({
            where: { format },
            create: { format, content },
            update: { content },
        });
        await audit(tx, actorId, "template.save", format, {
            length: content.length,
        });
        return view(format, row);
    }),
);

/** Back to the built-in template. */
templateRoutes.delete(
    "/subscription-templates/:format",
    adminWrite(200, async (req, tx) => {
        const format = parse(templateFormatSchema, req.params.format);
        const actorId = adminActorId(req);
        await tx.subscriptionTemplate.deleteMany({ where: { format } });
        await audit(tx, actorId, "template.reset", format);
        return view(format, null);
    }),
);
