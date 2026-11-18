import type { Prisma } from "@prisma/client";
import type { Plan } from "@xboard/contracts";
import { db } from "../../db";

export type PlanWithPrices = Prisma.PlanGetPayload<{
    include: { prices: true };
}>;

export function toPlan(plan: PlanWithPrices): Plan {
    return {
        id: plan.id,
        name: plan.name,
        description: plan.content ?? "",
        transferBytes: plan.transferEnable.toString(),
        speedLimitMbps: plan.speedLimit,
        deviceLimit: plan.deviceLimit,
        trafficResetMode: plan.trafficResetMode,
        trafficResetPriceMinor: plan.trafficResetPriceMinor,
        prices: plan.prices.map(({ period, amountMinor }) => ({
            period,
            amountMinor,
        })),
    };
}

/** Plans on sale: published and not deleted. */
export async function listPlans(): Promise<Plan[]> {
    const plans = await db.plan.findMany({
        where: { published: true, deletedAt: null },
        include: { prices: { orderBy: { id: "asc" } } },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
    });
    return plans.map(toPlan);
}
