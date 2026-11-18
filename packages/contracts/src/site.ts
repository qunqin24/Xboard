import { z } from "zod";

export const siteSchema = z.object({
    siteName: z.string(),
    registrationOpen: z.boolean(),
    supportNote: z.string(),
});
export type Site = z.infer<typeof siteSchema>;

export const settingsBody = z.strictObject({
    siteName: z
        .string()
        .trim()
        .min(1, "请输入站点名称")
        .max(40, "站点名称最多 40 个字"),
    registrationOpen: z.boolean(),
    supportNote: z.string().max(500, "客服说明最多 500 字"),
});
