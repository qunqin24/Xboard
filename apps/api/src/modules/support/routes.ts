import { Router } from "express";
import {
    createTicketBody,
    idParam,
    ticketMessageBody,
    ticketStatusBody,
} from "@xboard/contracts";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import {
    listPublishedNotices,
    listTickets,
    openTicket,
    replyToTicket,
    setTicketClosed,
    type TicketActor,
} from "./service";

export const supportRoutes = Router();
supportRoutes.use(["/notices", "/tickets"], requireUser);

/** On these routes everyone, admins included, acts as a customer on their own tickets. */
const customer = (userId: number): TicketActor => ({ userId, staff: false });

supportRoutes.get("/notices", async (_req, res) => {
    res.json(await listPublishedNotices());
});

supportRoutes.get("/tickets", async (req, res) => {
    res.json(await listTickets(customer(currentUser(req).id)));
});

supportRoutes.post("/tickets", async (req, res) => {
    const input = parse(createTicketBody, req.body);
    res.status(201).json(
        await openTicket(currentUser(req).id, input.subject, input.content),
    );
});

supportRoutes.post("/tickets/:id/reply", async (req, res) => {
    const { content } = parse(ticketMessageBody, req.body);
    const id = parse(idParam, req.params.id);
    res.status(201).json(
        await replyToTicket(customer(currentUser(req).id), id, content),
    );
});

supportRoutes.post("/tickets/:id/status", async (req, res) => {
    const { closed } = parse(ticketStatusBody, req.body);
    await setTicketClosed(
        customer(currentUser(req).id),
        parse(idParam, req.params.id),
        closed,
    );
    res.status(201).json({ ok: true });
});
