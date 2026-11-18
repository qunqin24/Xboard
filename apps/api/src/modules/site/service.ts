import type { Site } from "@xboard/contracts";
import { db, type Tx } from "../../db";

export const SETTING_DEFAULTS: Site = {
    siteName: "Xboard",
    registrationOpen: true,
    supportNote: "",
};

const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof Site)[];

/** Site settings as key/value rows over typed defaults; rows of the wrong type are ignored. */
export async function readSettings(client: Tx = db): Promise<Site> {
    const rows = await client.setting.findMany({
        where: { key: { in: KEYS } },
    });
    const settings: Site = { ...SETTING_DEFAULTS };
    for (const row of rows) {
        const key = row.key as keyof Site;
        if (typeof row.value === typeof SETTING_DEFAULTS[key])
            (settings as Record<string, unknown>)[key] = row.value;
    }
    return settings;
}

export async function writeSettings(tx: Tx, settings: Site) {
    for (const key of KEYS)
        await tx.setting.upsert({
            where: { key },
            create: { key, value: settings[key] },
            update: { value: settings[key] },
        });
}
