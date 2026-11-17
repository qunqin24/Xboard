import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export type SiteSettings = {
    siteName: string;
    registrationOpen: boolean;
    supportNote: string;
};

export const SETTING_DEFAULTS: SiteSettings = {
    siteName: "Xboard",
    registrationOpen: true,
    supportNote: "",
};

const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof SiteSettings)[];

/** Key/value site settings with typed defaults; unknown or malformed rows are ignored. */
@Injectable()
export class SettingsService {
    constructor(private readonly db: PrismaService) {}

    async read(
        client: Prisma.TransactionClient | PrismaService = this.db,
    ): Promise<SiteSettings> {
        const rows = await client.setting.findMany({
            where: { key: { in: KEYS } },
        });
        const settings: SiteSettings = { ...SETTING_DEFAULTS };
        for (const row of rows) {
            const key = row.key as keyof SiteSettings;
            if (typeof row.value === typeof SETTING_DEFAULTS[key])
                (settings as Record<string, unknown>)[key] = row.value;
        }
        return settings;
    }

    async write(tx: Prisma.TransactionClient, settings: SiteSettings) {
        for (const key of KEYS)
            await tx.setting.upsert({
                where: { key },
                create: { key, value: settings[key] },
                update: { value: settings[key] },
            });
    }
}
