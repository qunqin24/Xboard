import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Get,
    Module,
    Param,
    ParseIntPipe,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { json } from "../../common/json";
import { AuthModule } from "../auth/auth.module";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { sessionDigest } from "../auth/auth.service";
import { AdminGuard } from "./admin.guard";
import {
    BanInput,
    CreditInput,
    NodeInput,
    NoticeInput,
    PlanInput,
    ResetTrafficInput,
} from "./admin.dto";
import { isFQDN, isIP } from "class-validator";

@Controller("admin")
@UseGuards(SessionGuard, AdminGuard)
class AdminController {
    constructor(private readonly db: PrismaService) {}

    @Get("overview")
    async overview() {
        const [users, orders, nodes, tickets, payments] = await Promise.all([
            this.db.user.count(),
            this.db.order.count(),
            this.db.node.count(),
            this.db.ticket.count({ where: { closed: false } }),
            this.db.order.aggregate({
                where: { status: "paid" },
                _sum: { amountMinor: true },
            }),
        ]);
        return {
            users,
            orders,
            nodes,
            openTickets: tickets,
            revenueMinor: payments._sum.amountMinor ?? 0,
        };
    }

    @Get("plans")
    async plans() {
        return json(
            await this.db.plan.findMany({
                include: { prices: true },
                orderBy: { sort: "asc" },
            }),
        );
    }

    private async savePlan(actor: User, input: PlanInput, id?: number) {
        if (
            new Set(input.prices.map((p) => p.period)).size !==
                input.prices.length ||
            (input.published && !input.prices.length)
        )
            throw new BadRequestException("付款周期重复或已发布套餐没有价格。");
        const { transferBytes, prices, ...rest } = input;
        return json(
            await this.db.$transaction(async (tx) => {
                const data = {
                    ...rest,
                    speedLimit: input.speedLimit ?? null,
                    deviceLimit: input.deviceLimit ?? null,
                    transferEnable: BigInt(transferBytes),
                };
                const plan = id
                    ? await tx.plan.update({ where: { id }, data })
                    : await tx.plan.create({ data });
                await tx.planPrice.deleteMany({ where: { planId: plan.id } });
                await tx.planPrice.createMany({
                    data: prices.map((p) => ({ ...p, planId: plan.id })),
                });
                await tx.audit.create({
                    data: {
                        actorId: actor.id,
                        action: "plan.save",
                        target: String(plan.id),
                        detail: { name: plan.name },
                    },
                });
                return plan;
            }),
        );
    }
    @Post("plans") createPlan(
        @CurrentUser() actor: User,
        @Body() input: PlanInput,
    ) {
        return this.savePlan(actor, input);
    }
    @Put("plans/:id") updatePlan(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() input: PlanInput,
    ) {
        return this.savePlan(actor, input, id);
    }

    @Get("users")
    async users() {
        return json(
            await this.db.user.findMany({
                take: 200,
                orderBy: { id: "desc" },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    banned: true,
                    balance: true,
                    planId: true,
                    transferEnable: true,
                    upload: true,
                    download: true,
                    expiredAt: true,
                    verifiedAt: true,
                },
            }),
        );
    }

    @Post("users/:id/credit")
    async credit(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() input: CreditInput,
    ) {
        return this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
            const prior = await tx.balanceEntry.findUnique({
                where: { requestId: input.requestId },
            });
            if (prior) {
                if (
                    prior.userId !== id ||
                    prior.amountMinor !== input.amountMinor ||
                    prior.reason !== input.reason
                )
                    throw new ConflictException("请求编号已用于另一笔入账。");
                return { id: prior.id };
            }
            const user = await tx.user.findUniqueOrThrow({ where: { id } });
            if (user.balance + input.amountMinor > 2000000000)
                throw new BadRequestException("余额超过上限。");
            await tx.user.update({
                where: { id },
                data: { balance: { increment: input.amountMinor } },
            });
            const entry = await tx.balanceEntry.create({
                data: { ...input, userId: id, actorId: actor.id },
            });
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "balance.credit",
                    target: String(id),
                    detail: {
                        amountMinor: input.amountMinor,
                        reason: input.reason,
                        entryId: entry.id,
                    },
                },
            });
            return { id: entry.id };
        });
    }

    @Post("users/:id/ban")
    async ban(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() input: BanInput,
    ) {
        const target = await this.db.user.findUniqueOrThrow({ where: { id } });
        if (target.role === "admin")
            throw new BadRequestException("不能通过此接口封禁管理员。");
        await this.db.$transaction([
            this.db.user.update({ where: { id }, data: input }),
            this.db.session.deleteMany({ where: { userId: id } }),
            this.db.audit.create({
                data: {
                    actorId: actor.id,
                    action: "user.ban",
                    target: String(id),
                    detail: { banned: input.banned },
                },
            }),
        ]);
        return { ok: true };
    }

    @Post("users/:id/reset-traffic")
    async reset(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() input: ResetTrafficInput,
    ) {
        await this.db.$transaction([
            this.db.user.update({
                where: { id },
                data: { upload: 0n, download: 0n },
            }),
            this.db.audit.create({
                data: {
                    actorId: actor.id,
                    action: "traffic.reset",
                    target: String(id),
                    detail: { reason: input.reason },
                },
            }),
        ]);
        return { ok: true };
    }

    @Get("orders")
    async orders() {
        return json(
            await this.db.order.findMany({
                take: 200,
                orderBy: { createdAt: "desc" },
                include: { user: { select: { email: true } } },
            }),
        );
    }
    @Get("ledger")
    async ledger() {
        return json(
            await this.db.balanceEntry.findMany({
                take: 200,
                orderBy: { createdAt: "desc" },
            }),
        );
    }
    @Get("audit")
    async audit() {
        return this.db.audit.findMany({ take: 200, orderBy: { id: "desc" } });
    }
    @Get("mail")
    async mail() {
        return this.db.mail.findMany({
            take: 100,
            orderBy: { id: "desc" },
            select: {
                id: true,
                to: true,
                subject: true,
                attempts: true,
                sentAt: true,
                nextAttempt: true,
                createdAt: true,
            },
        });
    }

    @Get("nodes")
    async nodes() {
        return (
            await this.db.node.findMany({
                include: { plans: true },
                orderBy: { id: "asc" },
            })
        ).map(({ tokenHash: _secret, ...node }) => node);
    }
    private async saveNode(actor: User, input: NodeInput, id?: number) {
        if (!isIP(input.host) && !isFQDN(input.host, { require_tld: false }))
            throw new BadRequestException("节点地址不是有效的 IP 或域名。");
        const { planIds, ...data } = input;
        const token = randomBytes(32).toString("base64url");
        const node = await this.db.$transaction(async (tx) => {
            const node = id
                ? await tx.node.update({ where: { id }, data })
                : await tx.node.create({
                      data: { ...data, tokenHash: sessionDigest(token) },
                  });
            await tx.nodePlan.deleteMany({ where: { nodeId: node.id } });
            await tx.nodePlan.createMany({
                data: planIds.map((planId) => ({ nodeId: node.id, planId })),
            });
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "node.save",
                    target: String(node.id),
                    detail: { name: node.name },
                },
            });
            return node;
        });
        return { id: node.id, ...(id ? {} : { token }) };
    }
    @Post("nodes") createNode(
        @CurrentUser() actor: User,
        @Body() input: NodeInput,
    ) {
        return this.saveNode(actor, input);
    }
    @Put("nodes/:id") updateNode(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() input: NodeInput,
    ) {
        return this.saveNode(actor, input, id);
    }
    @Post("nodes/:id/token")
    async rotateNode(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
    ) {
        const token = randomBytes(32).toString("base64url");
        await this.db.$transaction([
            this.db.node.update({
                where: { id },
                data: { tokenHash: sessionDigest(token) },
            }),
            this.db.audit.create({
                data: {
                    actorId: actor.id,
                    action: "node.rotate",
                    target: String(id),
                    detail: {},
                },
            }),
        ]);
        return { token };
    }

    @Get("notices") notices() {
        return this.db.notice.findMany({ orderBy: { id: "desc" }, take: 100 });
    }
    @Post("notices") async createNotice(
        @CurrentUser() actor: User,
        @Body() data: NoticeInput,
    ) {
        return this.db.$transaction(async (tx) => {
            const notice = await tx.notice.create({ data });
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "notice.create",
                    target: String(notice.id),
                    detail: {},
                },
            });
            return notice;
        });
    }
    @Put("notices/:id") async updateNotice(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() data: NoticeInput,
    ) {
        return this.db.$transaction(async (tx) => {
            const notice = await tx.notice.update({ where: { id }, data });
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "notice.update",
                    target: String(id),
                    detail: {},
                },
            });
            return notice;
        });
    }
}

@Module({
    imports: [AuthModule],
    controllers: [AdminController],
    providers: [AdminGuard],
})
export class AdminModule {}
