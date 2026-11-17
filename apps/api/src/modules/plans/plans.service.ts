import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { toPlanDto } from "./plan.mapper";

@Injectable()
export class PlansService {
    constructor(private readonly prisma: PrismaService) {}

    async list() {
        const plans = await this.prisma.plan.findMany({
            where: { published: true },
            include: { prices: { orderBy: { id: "asc" } } },
            orderBy: [{ sort: "asc" }, { id: "asc" }],
        });
        return plans.map(toPlanDto);
    }
}
