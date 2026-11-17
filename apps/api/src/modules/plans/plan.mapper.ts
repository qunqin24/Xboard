import type { Prisma } from "@prisma/client";
import type { PlanDto } from "./plan.dto";

export function toPlanDto(
    plan: Prisma.PlanGetPayload<{ include: { prices: true } }>,
): PlanDto {
    return {
        id: plan.id,
        name: plan.name,
        description: plan.content ?? "",
        transferBytes: plan.transferEnable.toString(),
        speedLimitMbps: plan.speedLimit,
        deviceLimit: plan.deviceLimit,
        prices: plan.prices.map(({ period, amountMinor }) => ({
            period,
            amountMinor,
        })),
    };
}
