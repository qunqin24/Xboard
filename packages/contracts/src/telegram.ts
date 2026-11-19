import { z } from "zod";

export const telegramSettingsBody = z.strictObject({
    telegramBotToken: z
        .string()
        .trim()
        .regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/)
        .nullable(),
});
export const telegramSettingsSchema = z.object({
    tokenSet: z.boolean(),
    username: z.string().nullable(),
});
export const telegramAccountSchema = z.object({
    enabled: z.boolean(),
    linked: z.boolean(),
});
export const telegramLinkSchema = z.object({
    url: z.url(),
    expiresAt: z.iso.datetime(),
});
export type TelegramSettings = z.infer<typeof telegramSettingsSchema>;
export type TelegramAccount = z.infer<typeof telegramAccountSchema>;
export type TelegramLink = z.infer<typeof telegramLinkSchema>;
