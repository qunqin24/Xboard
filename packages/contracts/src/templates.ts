import { z } from "zod";

/** Subscription formats whose rules and groups come from an editable template. */
export const TEMPLATE_FORMATS = [
    "mihomo",
    "singbox",
    "quantumultx",
    "loon",
    "shadowrocket",
] as const;
export const templateFormatSchema = z.enum(TEMPLATE_FORMATS);
export type TemplateFormat = z.infer<typeof templateFormatSchema>;

/** Largest template accepted (characters). */
export const TEMPLATE_MAX = 200_000;

export const subscriptionTemplateSchema = z.object({
    format: templateFormatSchema,
    content: z.string(),
    /** The built-in template, for comparison and "恢复默认". */
    defaultContent: z.string(),
    /** False while the built-in template is in use. */
    customized: z.boolean(),
    updatedAt: z.string().nullable(),
});
export type SubscriptionTemplate = z.infer<typeof subscriptionTemplateSchema>;

export const templateBody = z.strictObject({
    content: z
        .string()
        .min(1, "模板不能为空")
        .max(TEMPLATE_MAX, `模板最多 ${TEMPLATE_MAX} 个字符`),
});
