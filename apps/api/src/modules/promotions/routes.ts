import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import {
    couponBody,
    giftBody,
    enabledBody,
    idParam,
    redeemGiftBody,
    type Gift,
    type Coupon,
    type redeemGiftResult,
} from "@xboard/contracts";
import type { z } from "zod";
import { db } from "../../db";
import { badRequest, conflict } from "../../http/errors";
import { rateLimit } from "../../http/rate-limit";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit, isoOrNull } from "../admin/shared";
import { sessionDigest } from "../auth/service";
import { MAX_BALANCE_MINOR } from "../orders/credit";
import {
    applyTerm,
    lockBuyer,
    orderPlan,
    planSnapshot,
    purchaseType,
} from "../orders/terms";
import { adminActorId, adminRead, adminWrite } from "../admin/operations";

export const adminPromotionRoutes = Router();
export const redemptionRoutes = Router();

adminPromotionRoutes.get(
    "/coupons",
    adminRead(async (_req) => {
        const coupons = await db.coupon.findMany({
            orderBy: { id: "desc" },
            include: {
                _count: { select: { orders: { where: { status: "paid" } } } },
            },
        });
        return coupons.map((row): Coupon => ({
            id: row.id,
            code: row.code,
            amountMinor: row.amountMinor,
            maxUses: row.maxUses,
            expiresAt: isoOrNull(row.expiresAt),
            enabled: row.enabled,
            used: row._count.orders,
        }));
    }),
);

function giftExpiry(value: string | null) {
    if (value === null) return null;
    const date = new Date(value);
    if (date <= new Date()) throw badRequest("有效期须晚于当前时间。");
    return date;
}

adminPromotionRoutes.post(
    "/coupons",
    adminWrite(201, async (req, tx) => {
        const input = parse(couponBody, req.body);
        const actorId = adminActorId(req);
        const coupon = await tx.coupon.create({
            data: { ...input, expiresAt: giftExpiry(input.expiresAt) },
        });
        await audit(tx, actorId, "coupon.create", coupon.id, {
            amountMinor: coupon.amountMinor,
            maxUses: coupon.maxUses,
        });
        const id = coupon.id;
        return { id };
    }),
);

adminPromotionRoutes.put(
    "/coupons/:id/enabled",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const data = parse(enabledBody, req.body);
        await tx.coupon.update({ where: { id }, data });
        await audit(tx, adminActorId(req), "coupon.enabled", id, data);
        return { ok: true };
    }),
);

adminPromotionRoutes.get(
    "/gift-codes",
    adminRead(async (_req) => {
        const gifts = await db.giftCode.findMany({
            orderBy: { id: "desc" },
            include: { plan: { select: { name: true } } },
        });
        return gifts.map((row): Gift => ({
            id: row.id,
            label: row.label,
            kind: row.kind,
            amountMinor: row.amountMinor,
            period: row.period,
            planName: row.plan?.name ?? null,
            expiresAt: isoOrNull(row.expiresAt),
            enabled: row.enabled,
            redeemedAt: isoOrNull(row.redeemedAt),
        }));
    }),
);

adminPromotionRoutes.post(
    "/gift-codes",
    adminWrite(201, async (req, tx) => {
        const input = parse(giftBody, req.body);
        const actorId = adminActorId(req);
        const code = `GIFT-${randomBytes(16).toString("hex").toUpperCase()}`;
        if (input.kind === "subscription") await orderPlan(tx, input.planId);
        const row = await tx.giftCode.create({
            data: {
                ...input,
                expiresAt: giftExpiry(input.expiresAt),
                digest: sessionDigest(code),
            },
        });
        await audit(tx, actorId, "gift.create", row.id, {
            kind: row.kind,
            amountMinor: row.amountMinor,
            planId: row.planId,
            period: row.period,
        });
        const id = row.id;
        return { id, code };
    }),
);

adminPromotionRoutes.put(
    "/gift-codes/:id/enabled",
    adminWrite(200, async (req, tx) => {
        const id = parse(idParam, req.params.id);
        const data = parse(enabledBody, req.body);
        await tx.giftCode.update({ where: { id }, data });
        await audit(tx, adminActorId(req), "gift.enabled", id, data);
        return { ok: true };
    }),
);

async function redeem(
    userId: number,
    code: string,
): Promise<z.infer<typeof redeemGiftResult>> {
    return db.$transaction(async (tx) => {
        const user = await lockBuyer(tx, userId);
        const digest = sessionDigest(code);
        await tx.$queryRaw`SELECT id FROM "GiftCode" WHERE digest = ${digest} FOR UPDATE`;
        const found = await tx.giftCode.findUnique({
            where: { digest },
            include: { plan: { select: { name: true } } },
        });
        if (!found) throw badRequest("兑换码无效、已领取或已过期。");
        const reward =
            found.kind === "balance"
                ? { kind: "balance" as const, amountMinor: found.amountMinor! }
                : {
                      kind: "subscription" as const,
                      planName: found.plan!.name,
                      period: found.period!,
                  };
        if (found.redeemedById === userId) return reward;
        const now = new Date();
        if (
            !found.enabled ||
            found.redeemedById !== null ||
            (found.expiresAt && found.expiresAt <= now)
        )
            throw badRequest("兑换码无效、已领取或已过期。");
        if (reward.kind === "balance") {
            if (user.balance + reward.amountMinor > MAX_BALANCE_MINOR)
                throw conflict("兑换后余额将超过上限，请联系管理员。");
            await tx.user.update({
                where: { id: user.id },
                data: { balance: { increment: reward.amountMinor } },
            });
            await tx.balanceEntry.create({
                data: {
                    userId,
                    amountMinor: reward.amountMinor,
                    reason: "兑换礼品卡",
                },
            });
        } else {
            const plan = await orderPlan(tx, found.planId!);
            const purchase = purchaseType(user, plan.id, now, reward.period);
            if (purchase === "switch")
                throw conflict("请在当前套餐到期后兑换该套餐。");
            const term = planSnapshot(plan, reward.period);
            const applied = await applyTerm(
                tx,
                user,
                term,
                purchase === "renewal",
                now,
            );
            await tx.order.create({
                data: {
                    ...term,
                    ...applied,
                    userId,
                    requestId: randomUUID(),
                    status: "paid",
                    amountMinor: 0,
                    paidAt: now,
                    expiresAt: now,
                },
            });
        }
        await tx.giftCode.update({
            where: { id: found.id },
            data: { redeemedById: user.id, redeemedAt: now },
        });
        await audit(tx, user.id, "gift.redeem", found.id, { ...reward });
        return reward;
    });
}

redemptionRoutes.post(
    "/account/redeem",
    requireUser,
    rateLimit({ limit: 8, windowMs: 60_000, scope: "gift-redeem" }),
    async (req, res) => {
        const { code } = parse(redeemGiftBody, req.body);
        res.status(201).json(await redeem(currentUser(req).id, code));
    },
);
