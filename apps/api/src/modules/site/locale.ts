import { Router } from "express";
import { localeBody, type Locale } from "@xboard/contracts";
import { db } from "../../db";
import { HttpError } from "../../http/errors";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";
import { adminActorId, adminRead, adminWrite } from "../admin/operations";
import { authenticate, SESSION_COOKIE } from "../auth/service";

import { defaultLocale, validLocale } from "./language";

export const localeRoutes = Router();
localeRoutes.get("/site/locale", async (req, res) => {
    const session = req.cookies?.[SESSION_COOKIE];
    let preferred: Locale | undefined;
    if (session) {
        try {
            preferred = validLocale((await authenticate(session)).locale);
        } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 401)
                throw error;
        }
    }
    res.json({ locale: preferred ?? (await defaultLocale()) });
});
localeRoutes.put("/account/locale", requireUser, async (req, res) => {
    const { locale } = parse(localeBody, req.body);
    await db.user.update({
        where: { id: currentUser(req).id },
        data: { locale },
    });
    res.json({ locale });
});

export const localeAdminRoutes = Router();
localeAdminRoutes.get(
    "/settings/locale",
    adminRead(async () => ({ locale: await defaultLocale() })),
);
localeAdminRoutes.put(
    "/settings/locale",
    adminWrite(200, async (req, tx) => {
        const { locale } = parse(localeBody, req.body);
        await tx.setting.upsert({
            where: { key: "defaultLocale" },
            create: { key: "defaultLocale", value: locale },
            update: { value: locale },
        });
        await audit(tx, adminActorId(req), "settings.locale_update", "locale", {
            locale,
        });
        return { locale };
    }),
);
