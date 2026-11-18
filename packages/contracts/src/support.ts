import { z } from "zod";

export const TICKET_SUBJECT_MAX = 120;
export const TICKET_MESSAGE_MAX = 5000;

export const noticeSchema = z.object({
    id: z.number().int(),
    title: z.string(),
    content: z.string(),
    createdAt: z.string(),
});
export type Notice = z.infer<typeof noticeSchema>;

export const ticketMessageSchema = z.object({
    id: z.number().int(),
    isStaff: z.boolean(),
    content: z.string(),
    createdAt: z.string(),
});
export const ticketSchema = z.object({
    id: z.number().int(),
    subject: z.string(),
    closed: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    user: z.object({ email: z.string() }),
    messages: z.array(ticketMessageSchema),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const createTicketBody = z.strictObject({
    subject: z
        .string()
        .trim()
        .min(1, "请输入主题")
        .max(TICKET_SUBJECT_MAX, `主题最多 ${TICKET_SUBJECT_MAX} 个字`),
    content: z
        .string()
        .trim()
        .min(1, "请描述问题")
        .max(TICKET_MESSAGE_MAX, `内容最多 ${TICKET_MESSAGE_MAX} 个字`),
});
export const ticketMessageBody = z.strictObject({
    content: z
        .string()
        .trim()
        .min(1, "请输入内容")
        .max(TICKET_MESSAGE_MAX, `内容最多 ${TICKET_MESSAGE_MAX} 个字`),
});
export const ticketStatusBody = z.strictObject({ closed: z.boolean() });
