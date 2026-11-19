import express, { Router } from "express";
import {
    checkoutBody,
    gatewayBody,
    idParam,
    uuidParam,
} from "@xboard/contracts";
import { db } from "../../db";
import { badRequest, unauthorized } from "../../http/errors";
import { rateLimit } from "../../http/rate-limit";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { adminActorId, adminRead, adminWrite } from "../admin/operations";
import {
    checkEpay,
    epayReceipt,
    stripeEnvelope,
    stripeMatches,
    stripeReceipt,
    stripeWebhookSecret,
    verifyStripeSignature,
} from "./gateways";
import {
    acceptPayment,
    gatewayView,
    publicGateway,
    saveGateway,
    startCheckout,
} from "./service";

export const paymentsRoutes = Router();
paymentsRoutes.get("/payments/gateways", requireUser, async (_req, res) => {
    res.json(
        (
            await db.paymentGateway.findMany({
                where: { enabled: true },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            })
        ).map(publicGateway),
    );
});
paymentsRoutes.post("/orders/:id/checkout", requireUser, async (req, res) => {
    res.json(
        await startCheckout(
            currentUser(req).id,
            parse(uuidParam, req.params.id),
            parse(checkoutBody, req.body),
        ),
    );
});

export const paymentAdminRoutes = Router();
paymentAdminRoutes.get(
    "/payment-gateways",
    adminRead(async () =>
        (
            await db.paymentGateway.findMany({
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            })
        ).map(gatewayView),
    ),
);
paymentAdminRoutes.post(
    "/payment-gateways",
    adminWrite(201, (req, tx) =>
        saveGateway(tx, adminActorId(req), parse(gatewayBody, req.body)),
    ),
);
paymentAdminRoutes.put(
    "/payment-gateways/:id",
    adminWrite(200, (req, tx) =>
        saveGateway(
            tx,
            adminActorId(req),
            parse(gatewayBody, req.body),
            parse(idParam, req.params.id),
        ),
    ),
);
paymentAdminRoutes.get(
    "/payment-receipts",
    adminRead(async () =>
        (
            await db.paymentAttempt.findMany({
                where: { receivedAt: { not: null } },
                orderBy: { receivedAt: "desc" },
                take: 100,
                select: {
                    id: true,
                    orderId: true,
                    gatewayId: true,
                    amountMinor: true,
                    feeMinor: true,
                    status: true,
                    externalId: true,
                    receivedAt: true,
                },
            })
        ).map((row) => ({
            ...row,
            receivedAt: row.receivedAt?.toISOString() ?? null,
        })),
    ),
);

export const paymentWebhooks = Router();
paymentWebhooks.use(
    rateLimit({ limit: 240, windowMs: 60_000, scope: "payment-webhook" }),
);
async function loadGateway(gatewayId: number, kind: "epay" | "stripe") {
    // A disabled gateway still accepts callbacks for money already received.
    const gateway = await db.paymentGateway.findFirst({
        where: { id: gatewayId, kind },
    });
    if (!gateway?.secrets) throw unauthorized("支付回执无效。");
    return gateway;
}

function findAttempt(
    where: { id: string } | { providerReference: string },
    gatewayId: number,
) {
    return db.paymentAttempt.findFirst({
        where: { ...where, gatewayId },
        include: { order: { select: { userId: true } } },
    });
}

/** Stripe events the account sends for other integrations are acknowledged and ignored. */
const ignoredStripeEvent = stripeReceipt.pick({ mode: true, metadata: true });

paymentWebhooks.post(
    "/stripe/:gatewayId",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
        if (!Buffer.isBuffer(req.body)) throw badRequest("支付回执格式无效。");
        const raw = req.body as Buffer;
        const gateway = await loadGateway(
            parse(idParam, req.params.gatewayId),
            "stripe",
        );
        if (
            !verifyStripeSignature(
                raw,
                req.get("Stripe-Signature") ?? "",
                stripeWebhookSecret(gateway),
            )
        )
            throw unauthorized("支付回执验签失败。");
        let body: unknown;
        try {
            body = JSON.parse(raw.toString("utf8"));
        } catch {
            throw badRequest("支付回执格式无效。");
        }
        const event = parse(stripeEnvelope, body);
        if (
            (event.type !== "checkout.session.completed" &&
                event.type !== "checkout.session.async_payment_succeeded") ||
            !ignoredStripeEvent.safeParse(event.data.object).success
        ) {
            res.sendStatus(204);
            return;
        }
        const data = parse(stripeReceipt, event.data.object);
        if (data.payment_status !== "paid") {
            res.sendStatus(204);
            return;
        }
        const attempt = await findAttempt(
            { id: data.metadata.xboard_payment },
            gateway.id,
        );
        if (!attempt) throw unauthorized("支付回执无效。");
        if (!stripeMatches(attempt, data))
            throw unauthorized("支付回执与订单不符。");
        await acceptPayment(attempt, data.id);
        res.sendStatus(204);
    },
);

paymentWebhooks
    .route("/epay/:gatewayId")
    .get(receiveEpay)
    .post(express.urlencoded({ extended: false, limit: "32kb" }), receiveEpay);
async function receiveEpay(req: express.Request, res: express.Response) {
    const data = parse(
        epayReceipt,
        req.method === "GET" ? req.query : req.body,
    );
    const gateway = await loadGateway(
        parse(idParam, req.params.gatewayId),
        "epay",
    );
    const attempt = await findAttempt(
        { providerReference: data.out_trade_no },
        gateway.id,
    );
    if (!attempt) throw unauthorized("支付回执无效。");
    if (!checkEpay(gateway, attempt, data))
        throw unauthorized("支付回执验签失败。");
    await acceptPayment(attempt, data.trade_no);
    res.type("text/plain").send("success");
}
