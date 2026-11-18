import type { Prisma } from "@prisma/client";
import type { Notice, Ticket } from "@xboard/contracts";
import { db } from "../../db";
import { badRequest, notFound } from "../../http/errors";

export async function listPublishedNotices(): Promise<Notice[]> {
    const rows = await db.notice.findMany({
        where: { published: true },
        take: 50,
        orderBy: { id: "desc" },
    });
    return rows.map(({ id, title, content, createdAt }) => ({
        id,
        title,
        content,
        createdAt: createdAt.toISOString(),
    }));
}

const ticketInclude = {
    messages: { orderBy: { id: "asc" } },
    user: { select: { email: true } },
} satisfies Prisma.TicketInclude;

type TicketRow = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function toTicket(row: TicketRow): Ticket {
    return {
        id: row.id,
        subject: row.subject,
        closed: row.closed,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        user: { email: row.user.email },
        messages: row.messages.map((m) => ({
            id: m.id,
            isStaff: m.isStaff,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
        })),
    };
}

/**
 * Who is acting on tickets. A user sees and changes only their own tickets;
 * staff (the admin routes) see all of them and reply as support.
 */
export type TicketActor = { userId: number; staff: boolean };

function scope(actor: TicketActor, id?: number): Prisma.TicketWhereInput {
    return {
        ...(id === undefined ? {} : { id }),
        ...(actor.staff ? {} : { userId: actor.userId }),
    };
}

export async function listTickets(
    actor: TicketActor,
    take = 100,
): Promise<Ticket[]> {
    const rows = await db.ticket.findMany({
        where: scope(actor),
        take,
        orderBy: { updatedAt: "desc" },
        include: ticketInclude,
    });
    return rows.map(toTicket);
}

export async function openTicket(
    userId: number,
    subject: string,
    content: string,
): Promise<Ticket> {
    const row = await db.ticket.create({
        data: {
            subject,
            userId,
            messages: { create: { content, authorId: userId, isStaff: false } },
        },
        include: ticketInclude,
    });
    return toTicket(row);
}

export async function replyToTicket(
    actor: TicketActor,
    id: number,
    content: string,
): Promise<Ticket> {
    return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
        const ticket = await tx.ticket.findFirst({ where: scope(actor, id) });
        if (!ticket) throw notFound("工单不存在。");
        if (ticket.closed) throw badRequest("工单已关闭，请先重新打开。");
        const row = await tx.ticket.update({
            where: { id },
            data: {
                updatedAt: new Date(),
                messages: {
                    create: {
                        content,
                        authorId: actor.userId,
                        isStaff: actor.staff,
                    },
                },
            },
            include: ticketInclude,
        });
        return toTicket(row);
    });
}

export async function setTicketClosed(
    actor: TicketActor,
    id: number,
    closed: boolean,
) {
    const result = await db.ticket.updateMany({
        where: scope(actor, id),
        data: { closed },
    });
    if (!result.count) throw notFound("工单不存在。");
}
