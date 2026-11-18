import { Router } from "express";
import { createOrderBody, uuidParam } from "@xboard/contracts";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { cancelOrder, createOrder, listOrders, payOrder } from "./service";

export const orderRoutes = Router();
orderRoutes.use("/orders", requireUser);

orderRoutes.get("/orders", async (req, res) => {
    res.json(await listOrders(currentUser(req).id));
});

orderRoutes.post("/orders", async (req, res) => {
    const input = parse(createOrderBody, req.body);
    res.status(201).json(await createOrder(currentUser(req).id, input));
});

orderRoutes.post("/orders/:id/pay", async (req, res) => {
    res.json(
        await payOrder(currentUser(req).id, parse(uuidParam, req.params.id)),
    );
});

orderRoutes.post("/orders/:id/cancel", async (req, res) => {
    res.json(
        await cancelOrder(currentUser(req).id, parse(uuidParam, req.params.id)),
    );
});
