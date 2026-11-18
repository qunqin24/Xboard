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
import { currentUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit, iso } from "../admin/shared";
import { DEFAULT_TEMPLATES } from "./defaults";
import { validateTemplate } from "./service";

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

templateRoutes.get("/subscription-templates", async (_req, res) => {
    const rows = new Map(
        (await db.subscriptionTemplate.findMany()).map((row) => [
            row.format,
            row,
        ]),
    );
    res.json(
        TEMPLATE_FORMATS.map((format) =>
            view(format, rows.get(format) ?? null),
        ),
    );
});

/** Saves after validation; saving the built-in text is the same as restoring it. */
templateRoutes.put("/subscription-templates/:format", async (req, res) => {
    const format = parse(templateFormatSchema, req.params.format);
    const { content } = parse(templateBody, req.body);
    const errors = validateTemplate(format, content);
    if (errors.length) throw badRequest(errors.join("\n"));
    const actor = currentUser(req);
    const row = await db.$transaction(async (tx) => {
        const row = await tx.subscriptionTemplate.upsert({
            where: { format },
            create: { format, content },
            update: { content },
        });
        await audit(tx, actor.id, "template.save", format, {
            length: content.length,
        });
        return row;
    });
    res.json(view(format, row));
});

/** Back to the built-in template. */
templateRoutes.delete("/subscription-templates/:format", async (req, res) => {
    const format = parse(templateFormatSchema, req.params.format);
    const actor = currentUser(req);
    await db.$transaction(async (tx) => {
        await tx.subscriptionTemplate.deleteMany({ where: { format } });
        await audit(tx, actor.id, "template.reset", format);
    });
    res.json(view(format, null));
});
