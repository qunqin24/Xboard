import type { Tx } from "../../db";
import { badRequest, conflict } from "../../http/errors";

export async function availableCoupon(
    tx: Tx,
    userId: number,
    key: { id: number } | { code: string },
) {
    if ("id" in key)
        await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = ${key.id} FOR UPDATE`;
    else
        await tx.$queryRaw`SELECT id FROM "Coupon" WHERE code = ${key.code} FOR UPDATE`;
    const coupon = await tx.coupon.findUnique({ where: key });
    if (
        !coupon ||
        !coupon.enabled ||
        (coupon.expiresAt && coupon.expiresAt <= new Date())
    )
        throw badRequest("优惠码无效或已过期。");
    const where = { couponId: coupon.id, status: "paid" } as const;
    if (await tx.order.count({ where: { ...where, userId } }))
        throw conflict("该账户已使用此优惠码。");
    if ((await tx.order.count({ where })) >= coupon.maxUses)
        throw conflict("该优惠码已达到使用上限。");
    return coupon;
}
