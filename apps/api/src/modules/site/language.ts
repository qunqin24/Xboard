import type { Request } from "express";
import { LOCALE_DEFAULT, localeSchema, type Locale } from "@xboard/contracts";
import { db, type Tx } from "../../db";

export function validLocale(value: unknown): Locale | undefined {
    const result = localeSchema.safeParse(value);
    return result.success ? result.data : undefined;
}

export function requestLocale(req: Request) {
    return validLocale(req.get("X-Xboard-Locale"));
}

export async function defaultLocale(tx: Tx = db) {
    const settings = await tx.setting.findUnique({
        where: { key: "defaultLocale" },
    });
    return validLocale(settings?.value) ?? LOCALE_DEFAULT;
}
