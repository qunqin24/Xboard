import { randomBytes, randomUUID } from "node:crypto";
import type { PaymentAttempt, PaymentGateway } from "@prisma/client";
import type { CheckoutBody, GatewayBody } from "@xboard/contracts";
import { db, lockUser, type Tx } from "../../db";
import { badRequest, conflict, HttpError, notFound } from "../../http/errors";
import { audit } from "../admin/shared";
import { MAX_BALANCE_MINOR } from "../orders/credit";
import { payableAmount, settleOrder } from "../orders/service";
import { sealApplicationSecret } from "../system/secrets";
import { checkoutFor } from "./gateways";

export function gatewayView(row: PaymentGateway) {
    const { secrets: _, ...view } = row;
    return { ...view, configured: Boolean(row.secrets) };
}
export function publicGateway(row: PaymentGateway) {
    const { id, name, kind, icon, feePercentBasisPoints, feeFixedMinor } = row;
    return { id, name, kind, icon, feePercentBasisPoints, feeFixedMinor };
}

export async function saveGateway(
    tx: Tx,
    actorId: number,
    body: GatewayBody,
    id?: number,
) {
    if (id !== undefined)
        await tx.$queryRaw`SELECT id FROM "PaymentGateway" WHERE id = ${id} FOR UPDATE`;
    const previous =
        id === undefined
            ? null
            : await tx.paymentGateway.findUnique({ where: { id } });
    if (id !== undefined && !previous) throw notFound("支付网关不存在。");
    if (previous && previous.kind !== body.kind)
        throw badRequest("已有网关不能改变类型。");
    const { secrets, ...config } = body;
    const encrypted = secrets
        ? sealApplicationSecret(
              "payment-gateway",
              Buffer.from(JSON.stringify(secrets)),
          )
        : previous?.secrets;
    if (!encrypted) throw badRequest("请配置网关密钥。");
    const data = { ...config, secrets: encrypted };
    const row = previous
        ? await tx.paymentGateway.update({ where: { id }, data })
        : await tx.paymentGateway.create({ data });
    await audit(tx, actorId, "payment.gateway_save", row.id, {
        kind: row.kind,
        name: row.name,
        enabled: row.enabled,
        secretChanged: Boolean(secrets),
    });
    return gatewayView(row);
}

export async function startCheckout(
    userId: number,
    orderId: string,
    input: CheckoutBody,
) {
    const include = { order: true, gateway: true } as const;
    const attempt = await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const order = await tx.order.findFirst({
            where: { id: orderId, userId },
        });
        if (!order) throw notFound("订单不存在。");
        if (order.status !== "pending" || order.expiresAt <= new Date())
            throw conflict("订单已结束，请刷新。");
        const amount = payableAmount(order);
        if (amount <= 0) throw badRequest("此订单可直接结算。");
        const active = await tx.paymentGateway.findFirst({
            where: { id: input.gatewayId, enabled: true },
        });
        if (!active) throw notFound("支付网关不可用。");
        const prior = await tx.paymentAttempt.findUnique({
            where: {
                orderId_requestId: { orderId, requestId: input.requestId },
            },
            include,
        });
        if (prior) {
            if (prior.gatewayId !== active.id)
                throw conflict("请求编号已用于另一支付网关。");
            return prior;
        }
        const feeMinor =
            Math.ceil((amount * active.feePercentBasisPoints) / 10_000) +
            active.feeFixedMinor;
        const id = randomUUID();
        return tx.paymentAttempt.create({
            data: {
                id,
                orderId,
                gatewayId: active.id,
                requestId: input.requestId,
                providerReference:
                    active.kind === "epay"
                        ? "1" +
                          BigInt("0x" + randomBytes(12).toString("hex"))
                              .toString()
                              .padStart(31, "0")
                        : null,
                amountMinor: amount + feeMinor,
                feeMinor,
                config: active.config as object,
            },
            include,
        });
    });
    let url = attempt.checkoutUrl;
    if (!url) {
        const checkout = await checkoutFor(attempt);
        await db.paymentAttempt.updateMany({
            where: { id: attempt.id, checkoutUrl: null, status: "pending" },
            data: {
                checkoutUrl: checkout.url,
                externalId: checkout.externalId,
            },
        });
        url = checkout.url;
    }
    return {
        url,
        amountMinor: attempt.amountMinor,
        feeMinor: attempt.feeMinor,
    };
}

export async function acceptPayment(
    attempt: PaymentAttempt & { order: { userId: number } },
    externalId: string,
) {
    await db.$transaction(async (tx) => {
        const userId = attempt.order.userId;
        await lockUser(tx, userId);
        const payment = await tx.paymentAttempt.findUniqueOrThrow({
            where: { id: attempt.id },
        });
        if (payment.externalId && payment.externalId !== externalId)
            throw conflict("支付回执编号不符。");
        if (payment.status !== "pending") return;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${payment.gatewayId}:${externalId}`}))::text`;
        const reused = await tx.paymentAttempt.findFirst({
            where: {
                gatewayId: payment.gatewayId,
                externalId,
                id: { not: payment.id },
            },
        });
        if (reused) throw conflict("支付回执已使用。");
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const principal = payment.amountMinor - payment.feeMinor;
        let status: "settled" | "credited" | "review" = "review";
        if (user.balance + principal <= MAX_BALANCE_MINOR) {
            await tx.user.update({
                where: { id: userId },
                data: { balance: { increment: principal } },
            });
            await tx.balanceEntry.create({
                data: {
                    userId,
                    amountMinor: principal,
                    reason: `在线支付入账（${payment.id}）`,
                },
            });
            status = "credited";
            await tx.$executeRawUnsafe("SAVEPOINT payment_entitlement");
            try {
                const order = await tx.order.findUniqueOrThrow({
                    where: { id: payment.orderId },
                });
                if (order.status === "pending") {
                    await settleOrder(tx, userId, order.id);
                    status = "settled";
                }
            } catch (error) {
                if (!(error instanceof HttpError) || error.status >= 500)
                    throw error;
                await tx.$executeRawUnsafe(
                    "ROLLBACK TO SAVEPOINT payment_entitlement",
                );
            }
            await tx.$executeRawUnsafe("RELEASE SAVEPOINT payment_entitlement");
        }
        await tx.paymentAttempt.update({
            where: { id: payment.id },
            data: { externalId, status, receivedAt: new Date() },
        });
        await audit(tx, 0, "payment.received", payment.id, {
            orderId: payment.orderId,
            gatewayId: payment.gatewayId,
            feeMinor: payment.feeMinor,
            principal,
            status,
        });
    });
}
