import { Router } from "express";
import type { Prisma } from "@prisma/client";
import {
    auditListQuery,
    idParam,
    ledgerListQuery,
    offlineOrderPaymentBody,
    orderListQuery,
    ticketMessageBody,
    ticketStatusBody,
    uuidParam,
    type AdminLedger,
    type AdminOrder,
    type Audit,
    type Mail,
} from "@xboard/contracts";
import { db } from "../../db";
import { parse } from "../../http/validate";
import { confirmOfflinePayment, payableAmount } from "../orders/service";
import {
    listTickets,
    replyToTicket,
    setTicketClosed,
    type TicketActor,
} from "../support/service";
import { iso, isoOrNull, numericTerm, pageArgs, paged } from "./shared";
import { adminActorId, adminRead, adminWrite } from "./operations";

/** Order operations, history and support tickets. */
export const recordRoutes = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Orders by buyer email or plan name fragment, user id or exact order id. */
recordRoutes.get(
    "/orders",
    adminRead(async (req) => {
        const query = parse(orderListQuery, req.query);
        const userId = numericTerm(query.q);
        const where: Prisma.OrderWhereInput = {
            ...(query.q
                ? {
                      OR: [
                          {
                              user: {
                                  email: {
                                      contains: query.q,
                                      mode: "insensitive",
                                  },
                              },
                          },
                          {
                              planName: {
                                  contains: query.q,
                                  mode: "insensitive",
                              },
                          },
                          ...(userId ? [{ userId }] : []),
                          ...(UUID.test(query.q)
                              ? [{ id: query.q.toLowerCase() }]
                              : []),
                      ],
                  }
                : {}),
            ...(query.status.length ? { status: { in: query.status } } : {}),
        };
        const [total, rows] = await db.$transaction([
            db.order.count({ where }),
            db.order.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                include: { user: { select: { email: true } } },
                ...pageArgs(query),
            }),
        ]);
        const items: AdminOrder[] = rows.map((order) => ({
            id: order.id,
            userId: order.userId,
            planName: order.planName,
            kind: order.kind,
            period: order.period,
            status: order.status,
            amountMinor: order.amountMinor,
            creditMinor: order.creditMinor,
            discountMinor: order.discountMinor,
            payableMinor: payableAmount(order),
            createdAt: iso(order.createdAt),
            expiresAt: iso(order.expiresAt),
            paidAt: isoOrNull(order.paidAt),
            user: { email: order.user.email },
        }));
        return paged(query, total, items);
    }),
);

recordRoutes.post(
    "/orders/:id/confirm-payment",
    adminWrite(200, async (req, tx) => {
        const id = parse(uuidParam, req.params.id);
        const receipt = parse(offlineOrderPaymentBody, req.body);
        return confirmOfflinePayment(tx, adminActorId(req), id, receipt);
    }),
);

/** Balance movements by email fragment, user id, reason fragment or order id. */
recordRoutes.get(
    "/ledger",
    adminRead(async (req) => {
        const query = parse(ledgerListQuery, req.query);
        const userId = numericTerm(query.q);
        const where: Prisma.BalanceEntryWhereInput = {
            ...(query.q
                ? {
                      OR: [
                          {
                              user: {
                                  email: {
                                      contains: query.q,
                                      mode: "insensitive",
                                  },
                              },
                          },
                          {
                              reason: {
                                  contains: query.q,
                                  mode: "insensitive",
                              },
                          },
                          ...(userId ? [{ userId }] : []),
                          ...(UUID.test(query.q)
                              ? [{ orderId: query.q.toLowerCase() }]
                              : []),
                      ],
                  }
                : {}),
            // Both kinds selected is the same as no filter.
            ...(query.kind.length === 1
                ? { orderId: query.kind[0] === "order" ? { not: null } : null }
                : {}),
        };
        const [total, rows] = await db.$transaction([
            db.balanceEntry.count({ where }),
            db.balanceEntry.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                include: { user: { select: { email: true } } },
                ...pageArgs(query),
            }),
        ]);
        const items: AdminLedger[] = rows.map((entry) => ({
            id: entry.id,
            userId: entry.userId,
            amountMinor: entry.amountMinor,
            reason: entry.reason,
            orderId: entry.orderId,
            actorId: entry.actorId,
            createdAt: iso(entry.createdAt),
            user: { email: entry.user.email },
        }));
        return paged(query, total, items);
    }),
);

/** Audit rows by action fragment ("user.ban"), target or actor id. */
recordRoutes.get(
    "/audit",
    adminRead(async (req) => {
        const query = parse(auditListQuery, req.query);
        const actorId = numericTerm(query.q);
        const where: Prisma.AuditWhereInput = {
            ...(query.q
                ? {
                      OR: [
                          {
                              action: {
                                  contains: query.q,
                                  mode: "insensitive",
                              },
                          },
                          { target: query.q },
                          ...(actorId ? [{ actorId }] : []),
                      ],
                  }
                : {}),
            ...(query.action.length ? { action: { in: query.action } } : {}),
            ...(query.opsTokenId.length
                ? { opsTokenId: { in: query.opsTokenId } }
                : {}),
        };
        const [total, rows] = await db.$transaction([
            db.audit.count({ where }),
            db.audit.findMany({
                where,
                orderBy: { id: "desc" },
                include: {
                    opsChanges: {
                        orderBy: { id: "asc" },
                        select: {
                            resource: true,
                            record: true,
                            before: true,
                            after: true,
                            privateFields: true,
                        },
                    },
                },
                ...pageArgs(query),
            }),
        ]);
        const items: Audit[] = rows.map(
            ({ opsTokenId, opsChanges, detail, ...row }) => ({
                ...row,
                createdAt: iso(row.createdAt),
                ...(opsTokenId && { opsTokenId }),
                detail:
                    row.action === "ops.request"
                        ? {
                              ...(detail as Prisma.JsonObject),
                              changes: opsChanges,
                          }
                        : detail,
            }),
        );
        return paged(query, total, items);
    }),
);

recordRoutes.get(
    "/mail",
    adminRead(async (_req) => {
        const rows = await db.mail.findMany({
            take: 100,
            orderBy: { id: "desc" },
            // The body may hold a one-time link; it is never sent to the browser.
            select: {
                id: true,
                to: true,
                subject: true,
                attempts: true,
                sentAt: true,
                nextAttempt: true,
                lastError: true,
                createdAt: true,
            },
        });
        const items: Mail[] = rows.map((row) => ({
            ...row,
            sentAt: isoOrNull(row.sentAt),
            nextAttempt: iso(row.nextAttempt),
            createdAt: iso(row.createdAt),
        }));
        return items;
    }),
);

// ---------- Tickets (as support staff) ----------

const staff = (userId: number): TicketActor => ({ userId, staff: true });

recordRoutes.get(
    "/tickets",
    adminRead(async (req) => {
        return await listTickets(staff(adminActorId(req)), 200);
    }),
);

recordRoutes.post(
    "/tickets/:id/reply",
    adminWrite(201, async (req, tx) => {
        const { content } = parse(ticketMessageBody, req.body);
        const id = parse(idParam, req.params.id);
        return replyToTicket(staff(adminActorId(req)), id, content, tx);
    }),
);

recordRoutes.post(
    "/tickets/:id/status",
    adminWrite(201, async (req, tx) => {
        const { closed } = parse(ticketStatusBody, req.body);
        await setTicketClosed(
            staff(adminActorId(req)),
            parse(idParam, req.params.id),
            closed,
            tx,
        );
        return { ok: true };
    }),
);
