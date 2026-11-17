import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    NotFoundException,
    Module,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { json } from "../../common/json";
import { AuthModule } from "../auth/auth.module";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { sessionDigest } from "../auth/auth.service";
import { AdminGuard } from "./admin.guard";
import {
    BanInput,
    BulkBanInput,
    CreditInput,
    NodeInput,
    NoticeInput,
    PlanInput,
    ResetTrafficInput,
    SettingsInput,
    UpdateUserInput,
} from "./admin.dto";
import { SettingsService } from "../site/settings.service";
import { SiteModule } from "../site/site.module";
import { hashPassword } from "../auth/password";
import { isFQDN, isIP } from "class-validator";

@Controller("admin")
@UseGuards(SessionGuard, AdminGuard)
class AdminController {
    constructor(
        private readonly db: PrismaService,
        private readonly settings: SettingsService,
    ) {}

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
                where: { deletedAt: null },
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
                    ? await tx.plan.update({
                          where: { id, deletedAt: null },
                          data,
                      })
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
                    speedLimit: true,
                    deviceLimit: true,
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
                where: { deletedAt: null },
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
            const live = await tx.plan.count({
                where: { id: { in: planIds }, deletedAt: null },
            });
            if (live !== planIds.length)
                throw new BadRequestException("关联的套餐不存在或已删除。");
            const node = id
                ? await tx.node.update({ where: { id, deletedAt: null }, data })
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
                where: { id, deletedAt: null },
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
    @Delete("notices/:id") async deleteNotice(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
    ) {
        await this.db.$transaction([
            this.db.notice.delete({ where: { id } }),
            this.db.audit.create({
                data: {
                    actorId: actor.id,
                    action: "notice.delete",
                    target: String(id),
                    detail: {},
                },
            }),
        ]);
        return { ok: true };
    }

    // Plans are soft-deleted so paid orders keep their plan reference. A plan
    // that still has subscribers must be unpublished and left to expire first.
    @Delete("plans/:id") async deletePlan(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
    ) {
        return this.db.$transaction(async (tx) => {
            const plan = await tx.plan.findFirst({
                where: { id, deletedAt: null },
            });
            if (!plan) throw new NotFoundException("套餐不存在。");
            // Expired subscribers keep planId as history and do not block deletion.
            const users = await tx.user.count({
                where: {
                    planId: id,
                    OR: [
                        { expiredAt: null },
                        { expiredAt: { gt: Math.floor(Date.now() / 1000) } },
                    ],
                },
            });
            if (users)
                throw new ConflictException(
                    `仍有 ${users} 个有效订阅使用该套餐，请先下架，待到期或为用户更换套餐后再删除。`,
                );
            await tx.plan.update({
                where: { id },
                data: { deletedAt: new Date(), published: false },
            });
            await tx.nodePlan.deleteMany({ where: { planId: id } });
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "plan.delete",
                    target: String(id),
                    detail: { name: plan.name },
                },
            });
            return { ok: true };
        });
    }

    // Nodes are soft-deleted to keep traffic history; the token is replaced so
    // a still-running backend can no longer authenticate.
    @Delete("nodes/:id") async deleteNode(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
    ) {
        return this.db.$transaction(async (tx) => {
            const node = await tx.node.update({
                where: { id, deletedAt: null },
                data: {
                    deletedAt: new Date(),
                    enabled: false,
                    tokenHash: sessionDigest(
                        randomBytes(32).toString("base64url"),
                    ),
                },
            });
            await tx.nodePlan.deleteMany({ where: { nodeId: id } });
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "node.delete",
                    target: String(id),
                    detail: { name: node.name },
                },
            });
            return { ok: true };
        });
    }

    @Put("users/:id")
    async updateUser(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
        @Body() input: UpdateUserInput,
    ) {
        return this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
            const before = await tx.user.findUnique({ where: { id } });
            if (!before) throw new NotFoundException("用户不存在。");
            if (
                input.planId !== null &&
                !(await tx.plan.findFirst({
                    where: { id: input.planId, deletedAt: null },
                }))
            )
                throw new BadRequestException("套餐不存在或已删除。");
            const data = {
                planId: input.planId,
                expiredAt: input.expiredAt,
                transferEnable: BigInt(input.transferBytes),
                speedLimit: input.speedLimit,
                deviceLimit: input.deviceLimit,
            };
            await tx.user.update({ where: { id }, data });
            const snapshot = (user: typeof data) => ({
                planId: user.planId,
                expiredAt: user.expiredAt,
                transferBytes: user.transferEnable.toString(),
                speedLimit: user.speedLimit,
                deviceLimit: user.deviceLimit,
            });
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "user.update",
                    target: String(id),
                    detail: { before: snapshot(before), after: snapshot(data) },
                },
            });
            return { ok: true };
        });
    }

    // Returns the temporary password exactly once; it is never stored or logged.
    @Post("users/:id/password")
    async resetPassword(
        @CurrentUser() actor: User,
        @Param("id", ParseIntPipe) id: number,
    ) {
        const target = await this.db.user.findUnique({ where: { id } });
        if (!target) throw new NotFoundException("用户不存在。");
        if (target.role === "admin")
            throw new BadRequestException("不能通过此接口重置管理员密码。");
        const alphabet =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        const password = Array.from(
            randomBytes(16),
            (byte) => alphabet[byte % alphabet.length],
        ).join("");
        await this.db.$transaction([
            this.db.user.update({
                where: { id },
                data: { password: await hashPassword(password) },
            }),
            this.db.session.deleteMany({ where: { userId: id } }),
            this.db.audit.create({
                data: {
                    actorId: actor.id,
                    action: "user.password_reset",
                    target: String(id),
                    detail: {},
                },
            }),
        ]);
        return { password };
    }

    @Post("users/ban")
    async bulkBan(@CurrentUser() actor: User, @Body() input: BulkBanInput) {
        return this.db.$transaction(async (tx) => {
            const targets = await tx.user.findMany({
                where: { id: { in: input.ids }, role: { not: "admin" } },
                select: { id: true },
            });
            const ids = targets.map((user) => user.id);
            await tx.user.updateMany({
                where: { id: { in: ids } },
                data: { banned: input.banned },
            });
            await tx.session.deleteMany({ where: { userId: { in: ids } } });
            await tx.audit.createMany({
                data: ids.map((id) => ({
                    actorId: actor.id,
                    action: "user.ban",
                    target: String(id),
                    detail: { banned: input.banned, bulk: true },
                })),
            });
            return {
                updated: ids.length,
                skipped: input.ids.length - ids.length,
            };
        });
    }

    @Get("settings") readSettings() {
        return this.settings.read();
    }

    @Put("settings") async saveSettings(
        @CurrentUser() actor: User,
        @Body() input: SettingsInput,
    ) {
        const next = {
            siteName: input.siteName.trim(),
            registrationOpen: input.registrationOpen,
            supportNote: input.supportNote,
        };
        if (!next.siteName) throw new BadRequestException("站点名称不能为空。");
        await this.db.$transaction(async (tx) => {
            const before = await this.settings.read(tx);
            await this.settings.write(tx, next);
            await tx.audit.create({
                data: {
                    actorId: actor.id,
                    action: "settings.update",
                    target: "site",
                    detail: { before, after: next },
                },
            });
        });
        return next;
    }

    // Daily buckets in Asia/Shanghai, oldest first, with every day present.
    @Get("stats")
    async stats(
        @Query("days", new DefaultValuePipe(30), ParseIntPipe) days: number,
    ) {
        if (days < 1 || days > 180)
            throw new BadRequestException("days 必须在 1 到 180 之间。");
        const local = (column: string) =>
            Prisma.raw(
                `("${column}" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date`,
            );
        const first = Prisma.sql`((now() AT TIME ZONE 'Asia/Shanghai')::date - ${days - 1}::int)`;
        const rows = await this.db.$queryRaw<
            {
                date: string;
                revenue: bigint;
                orders: bigint;
                users: bigint;
                traffic: string;
            }[]
        >`
            WITH day AS (
                SELECT generate_series(${first}, (now() AT TIME ZONE 'Asia/Shanghai')::date, interval '1 day')::date AS d
            ),
            paid AS (
                SELECT ${local("paidAt")} AS d, SUM("amountMinor") AS revenue, COUNT(*) AS orders
                FROM "Order" WHERE status = 'paid' AND "paidAt" IS NOT NULL AND ${local("paidAt")} >= ${first}
                GROUP BY 1
            ),
            joined AS (
                SELECT ${local("createdAt")} AS d, COUNT(*) AS users
                FROM "User" WHERE ${local("createdAt")} >= ${first}
                GROUP BY 1
            ),
            used AS (
                SELECT ${local("createdAt")} AS d, SUM(upload + download) AS traffic
                FROM "TrafficRecord" WHERE ${local("createdAt")} >= ${first}
                GROUP BY 1
            )
            SELECT to_char(day.d, 'YYYY-MM-DD') AS date,
                   COALESCE(paid.revenue, 0)::bigint AS revenue,
                   COALESCE(paid.orders, 0)::bigint AS orders,
                   COALESCE(joined.users, 0)::bigint AS users,
                   COALESCE(used.traffic, 0)::text AS traffic
            FROM day
            LEFT JOIN paid ON paid.d = day.d
            LEFT JOIN joined ON joined.d = day.d
            LEFT JOIN used ON used.d = day.d
            ORDER BY day.d`;
        const top = await this.db.$queryRaw<
            { planName: string; orders: bigint; revenue: bigint }[]
        >`
            SELECT "planName", COUNT(*) AS orders, SUM("amountMinor")::bigint AS revenue
            FROM "Order"
            WHERE status = 'paid' AND "paidAt" IS NOT NULL AND ${local("paidAt")} >= ${first}
            GROUP BY "planName"
            ORDER BY revenue DESC, orders DESC
            LIMIT 5`;
        return {
            days: rows.map((row) => ({
                date: row.date,
                revenueMinor: Number(row.revenue),
                paidOrders: Number(row.orders),
                newUsers: Number(row.users),
                trafficBytes: row.traffic,
            })),
            topPlans: top.map((row) => ({
                planName: row.planName,
                orders: Number(row.orders),
                revenueMinor: Number(row.revenue),
            })),
        };
    }
}

@Module({
    imports: [AuthModule, SiteModule],
    controllers: [AdminController],
    providers: [AdminGuard],
})
export class AdminModule {}
