import { Router } from "express";
import { createOrderBody, orderCouponBody, uuidParam } from "@xboard/contracts";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import {
    cancelOrder,
    createOrder,
    getOrder,
    listOrders,
    payOrder,
    setOrderCoupon,
} from "./service";

export const orderRoutes = Router();
orderRoutes.use("/orders", requireUser);

orderRoutes.get("/orders", async (req, res) => {
    res.json(await listOrders(currentUser(req).id));
});

orderRoutes.post("/orders", async (req, res) => {
    const input = parse(createOrderBody, req.body);
    res.status(201).json(await createOrder(currentUser(req).id, input));
});

orderRoutes.get("/orders/:id", async (req, res) => {
    res.json(
        await getOrder(currentUser(req).id, parse(uuidParam, req.params.id)),
    );
});

orderRoutes.put("/orders/:id/coupon", async (req, res) => {
    const { couponCode } = parse(orderCouponBody, req.body);
    res.json(
        await setOrderCoupon(
            currentUser(req).id,
            parse(uuidParam, req.params.id),
            couponCode,
        ),
    );
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
