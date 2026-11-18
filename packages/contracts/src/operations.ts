import { z } from "zod";
import { bytesSchema, idSchema, INT4_MAX } from "./common";

export const selectedUserIds = z
    .array(idSchema)
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, "用户重复");

export const helpBody = z.strictObject({
    title: z.string().trim().min(1, "请输入标题").max(120),
    body: z.string().trim().min(1, "请输入正文").max(20_000),
    sort: z.number().int().min(0).max(INT4_MAX),
    published: z.boolean(),
});
export const helpArticleSchema = helpBody.extend({ id: idSchema });
export type HelpArticle = z.infer<typeof helpArticleSchema>;

const rank = z.object({
    id: idSchema,
    name: z.string(),
    trafficBytes: bytesSchema,
});
export const rankingsSchema = z.object({
    users: z.array(rank),
    nodes: z.array(rank),
});
export type Rankings = z.infer<typeof rankingsSchema>;

const subject = z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[^\r\n]+$/, "主题不能换行");
const mailText = z.string().trim().min(1).max(20_000);
const message = { subject, text: mailText };
const broadcast = {
    ...message,
    requestId: z.uuid({ version: "v4" }),
};
export const broadcastBody = z.discriminatedUnion("scope", [
    z.strictObject({ ...broadcast, scope: z.literal("all") }),
    z.strictObject({
        ...broadcast,
        scope: z.literal("selected"),
        ids: selectedUserIds,
    }),
]);
export type BroadcastBody = z.infer<typeof broadcastBody>;
export const broadcastResult = z.object({
    recipients: z.number().int().nonnegative(),
});
export type BroadcastResult = z.infer<typeof broadcastResult>;

export const mailTemplateKey = z.enum([
    "verify_email",
    "reset_password",
    "registration_code",
    "registration_taken",
    "expiry_reminder",
    "traffic_reminder",
]);
export type MailTemplateKey = z.infer<typeof mailTemplateKey>;
export const mailTemplateBody = z.strictObject(message);
export const mailTemplateSchema = mailTemplateBody.extend({
    key: mailTemplateKey,
    variables: z.array(z.string()),
    required: z.array(z.string()),
});
export type MailTemplate = z.infer<typeof mailTemplateSchema>;
