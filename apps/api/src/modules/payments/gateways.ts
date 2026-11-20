import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Order, PaymentAttempt, PaymentGateway } from "@prisma/client";
import { getConfig } from "../../config";
import { HttpError, badRequest } from "../../http/errors";
import { openApplicationSecret } from "../system/secrets";

type Attempt = PaymentAttempt & {
    gateway: PaymentGateway;
    order: Pick<Order, "planName" | "expiresAt">;
};
const epayConfig = z.object({
    apiUrl: z.string(),
    pid: z.string(),
    payType: z.string(),
});
const epaySecrets = z.object({ key: z.string() });
const stripeSecrets = z.object({
    secretKey: z.string(),
    webhookSecret: z.string(),
});
const stripeCheckout = z.object({
    id: z.string().max(255),
    url: z.url({ protocol: /^https$/ }),
});
const money = (minor: number) =>
    `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

export const stripeEnvelope = z.object({
    type: z.string(),
    data: z.object({ object: z.unknown() }),
});
export const stripeReceipt = z.object({
    id: z.string().min(1).max(255),
    currency: z.string(),
    amount_total: z.number().int().positive(),
    payment_status: z.string(),
    mode: z.literal("payment"),
    metadata: z.object({ xboard_payment: z.uuid() }),
});
export const epayReceipt = z
    .object({
        pid: z.string(),
        trade_no: z.string().min(1).max(255),
        out_trade_no: z.string().regex(/^\d{1,32}$/),
        money: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/),
        trade_status: z.literal("TRADE_SUCCESS"),
        sign: z.string().regex(/^[a-fA-F0-9]{32}$/),
        sign_type: z.literal("MD5"),
    })
    .catchall(z.string())
    .refine(
        (params) =>
            Object.entries(params).every(
                ([key, value]) =>
                    /^[a-zA-Z0-9_]+$/.test(key) && !/[&=\r\n]/.test(value),
            ),
        "支付回执参数无效。",
    );

export function epaySign(parts: Record<string, unknown>, key: string) {
    const content = Object.keys(parts)
        .sort()
        .filter(
            (name) =>
                name !== "sign" && name !== "sign_type" && parts[name] !== "",
        )
        .map((name) => `${name}=${parts[name]}`)
        .join("&");
    return createHash("md5")
        .update(content + key, "utf8")
        .digest("hex");
}

function matchesHex(expected: string, value: string) {
    return (
        /^[a-f0-9]+$/i.test(value) &&
        value.length === expected.length &&
        timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(value, "hex"))
    );
}

export function verifyStripeSignature(
    raw: Buffer,
    header: string,
    secret: string,
    now = Date.now(),
) {
    const fields = header.split(",").map((field) => field.split("=", 2));
    const stamp = fields.find(([key]) => key === "t")?.[1];
    if (
        !stamp ||
        !/^\d{1,12}$/.test(stamp) ||
        Math.abs(now - Number(stamp) * 1000) > 300_000
    )
        return false;
    const expected = createHmac("sha256", secret)
        .update(stamp + ".")
        .update(raw)
        .digest("hex");
    return fields.some(
        ([key, value]) => key === "v1" && value && matchesHex(expected, value),
    );
}

/**
 * Callbacks are verified with the gateway's current credentials, so rotating a
 * leaked key also invalidates receipts forged with the old one.
 */
function credentials(gateway: PaymentGateway) {
    return JSON.parse(
        openApplicationSecret("payment-gateway", gateway.secrets).toString(
            "utf8",
        ),
    ) as unknown;
}

export function stripeWebhookSecret(gateway: PaymentGateway) {
    return stripeSecrets.parse(credentials(gateway)).webhookSecret;
}

export function checkEpay(
    gateway: PaymentGateway,
    attempt: PaymentAttempt,
    data: z.infer<typeof epayReceipt>,
) {
    const { pid } = epayConfig.parse(gateway.config);
    const { key } = epaySecrets.parse(credentials(gateway));
    const [units, cents = ""] = data.money.split(".");
    return (
        data.pid === pid &&
        Number(units) * 100 + Number(cents.padEnd(2, "0")) ===
            attempt.amountMinor &&
        matchesHex(epaySign(data, key), data.sign)
    );
}

/** The signature was checked before this; the session must match the attempt. */
export function stripeMatches(
    attempt: PaymentAttempt,
    data: z.infer<typeof stripeReceipt>,
) {
    return (
        data.currency === "cny" &&
        data.payment_status === "paid" &&
        data.amount_total === attempt.amountMinor
    );
}

export async function checkoutFor(
    attempt: Attempt,
): Promise<{ url: string; externalId?: string }> {
    const origin = getConfig().origin;
    if (attempt.gateway.kind === "epay") {
        const { apiUrl, pid, payType } = epayConfig.parse(
            attempt.gateway.config,
        );
        const { key } = epaySecrets.parse(credentials(attempt.gateway));
        const fields = {
            pid,
            out_trade_no: z.string().parse(attempt.providerReference),
            notify_url: `${origin}/api/payments/webhooks/epay/${attempt.gatewayId}`,
            return_url: `${origin}/orders/${attempt.orderId}`,
            name: attempt.order.planName.replace(/[&=\r\n]/g, " ").slice(0, 80),
            money: money(attempt.amountMinor),
            ...(payType && { type: payType }),
        };
        const url = new URL(apiUrl);
        if (url.username || url.password || url.search || url.hash)
            throw badRequest("易支付网关地址格式不正确。");
        url.pathname =
            url.pathname.replace(/\/+$/, "").replace(/\/submit\.php$/, "") +
            "/submit.php";
        url.search = new URLSearchParams({
            ...fields,
            sign: epaySign(fields, key),
            sign_type: "MD5",
        }).toString();
        return { url: url.toString() };
    }
    const { secretKey } = stripeSecrets.parse(credentials(attempt.gateway));
    try {
        const response = await fetch(
            "https://api.stripe.com/v1/checkout/sessions",
            {
                method: "POST",
                headers: {
                    authorization: `Bearer ${secretKey}`,
                    "idempotency-key": attempt.id,
                },
                body: new URLSearchParams({
                    mode: "payment",
                    success_url: `${origin}/orders/${attempt.orderId}`,
                    cancel_url: `${origin}/orders/${attempt.orderId}`,
                    client_reference_id: attempt.id,
                    // Close the session with the order (Stripe allows 30 minutes
                    // to 24 hours); a payment after the order lapses is credited
                    // to the balance instead.
                    expires_at: String(
                        Math.ceil(
                            Math.max(
                                attempt.order.expiresAt.getTime(),
                                Date.now() + 31 * 60_000,
                            ) / 1000,
                        ),
                    ),
                    "metadata[xboard_payment]": attempt.id,
                    "line_items[0][quantity]": "1",
                    "line_items[0][price_data][currency]": "cny",
                    "line_items[0][price_data][unit_amount]": String(
                        attempt.amountMinor,
                    ),
                    "line_items[0][price_data][product_data][name]":
                        attempt.order.planName,
                }),
                redirect: "error",
                signal: AbortSignal.timeout(8_000),
            },
        );
        if (!response.ok) throw new Error("Checkout refused");
        const { url, id } = stripeCheckout.parse(await response.json());
        return { url, externalId: id };
    } catch {
        throw new HttpError(502, "无法创建 Stripe 收款会话，请重试。");
    }
}
