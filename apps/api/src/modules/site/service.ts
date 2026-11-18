import { Prisma } from "@prisma/client";
import { settingsBody, type Settings, type Site } from "@xboard/contracts";
import { db, type Tx } from "../../db";

export const SETTING_DEFAULTS: Settings = {
    siteName: "Xboard",
    registrationOpen: true,
    supportNote: "",
    inviteOnly: false,
    emailCodeRequired: false,
    emailDomainMode: "off",
    emailDomains: [],
    gmailAliasCheck: false,
    registerIpDailyLimit: 0,
    trialPlanId: null,
    trialDays: 7,
    termsUrl: "",
    privacyUrl: "",
    expiryReminders: false,
    trafficReminders: false,
};

const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof Settings)[];

/**
 * Site settings as key/value rows over typed defaults. A row that no longer
 * passes its field's schema (older format, manual edit) falls back to the default.
 */
export async function readSettings(client: Tx = db): Promise<Settings> {
    const rows = await client.setting.findMany({
        where: { key: { in: KEYS } },
    });
    const settings: Settings = { ...SETTING_DEFAULTS };
    for (const row of rows) {
        const key = row.key as keyof Settings;
        const parsed = settingsBody.shape[key].safeParse(row.value);
        if (parsed.success)
            (settings as Record<string, unknown>)[key] = parsed.data;
    }
    return settings;
}

/** What any visitor may read: no domain lists, limits or trial details. */
export function publicSite(settings: Settings): Site {
    return {
        siteName: settings.siteName,
        registrationOpen: settings.registrationOpen,
        supportNote: settings.supportNote,
        inviteOnly: settings.inviteOnly,
        emailCodeRequired: settings.emailCodeRequired,
        termsUrl: settings.termsUrl,
        privacyUrl: settings.privacyUrl,
    };
}

export async function writeSettings(tx: Tx, settings: Settings) {
    for (const key of KEYS) {
        const value = settings[key] ?? Prisma.JsonNull;
        await tx.setting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
        });
    }
}
