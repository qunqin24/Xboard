import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Module,
    Param,
    Post,
    Query,
    Res,
    UnauthorizedException,
    UseGuards,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { FastifyReply } from "fastify";
import { PrismaService } from "../../database/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { sessionDigest } from "../auth/auth.service";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { available, NodesService } from "./nodes.service";
import { mihomo, singbox } from "./subscription";
import { getConfig } from "../../config";
import { XrayRController } from "./xrayr.controller";

@Controller("v1/server/UniProxy")
class UniProxyController {
    constructor(
        private readonly nodes: NodesService,
        private readonly db: PrismaService,
    ) {}
    @Get("config") async config(@Query() query: Record<string, unknown>) {
        return this.nodes.config(await this.nodes.authenticate(query));
    }
    @Get("user") async users(@Query() query: Record<string, unknown>) {
        return this.nodes.users((await this.nodes.authenticate(query)).id);
    }
    @Post("push") async push(
        @Query() query: Record<string, unknown>,
        @Body() body: unknown,
        @Headers("idempotency-key") key?: string,
    ) {
        return this.nodes.traffic(
            await this.nodes.authenticate(query),
            body,
            key,
        );
    }
    @Post("alive") async alive(
        @Query() query: Record<string, unknown>,
        @Body() body: unknown,
    ) {
        return this.nodes.alive(
            (await this.nodes.authenticate(query)).id,
            body,
        );
    }
    @Get("alivelist") async aliveList(@Query() query: Record<string, unknown>) {
        return this.nodes.aliveList((await this.nodes.authenticate(query)).id);
    }
    @Post("status") async status(
        @Query() query: Record<string, unknown>,
        @Body() body: unknown,
    ) {
        const node = await this.nodes.authenticate(query);
        // Store only validated metrics, never arbitrary objects from a node.
        if (!body || typeof body !== "object" || Array.isArray(body))
            throw new BadRequestException();
        const input = body as Record<string, unknown>;
        const status: Record<string, number | { total: number; used: number }> =
            {};
        if (typeof input.cpu !== "number" || input.cpu < 0 || input.cpu > 100)
            throw new BadRequestException();
        status.cpu = input.cpu;
        for (const name of ["mem", "swap", "disk"]) {
            const item = input[name] as
                { total?: number; used?: number } | undefined;
            if (
                !item ||
                !Number.isSafeInteger(item.total) ||
                !Number.isSafeInteger(item.used) ||
                item.total! < 0 ||
                item.used! < 0 ||
                item.used! > item.total!
            )
                throw new BadRequestException();
            status[name] = { total: item.total!, used: item.used! };
        }
        await this.db.node.update({ where: { id: node.id }, data: { status } });
        return { data: true, code: 0, message: "success" };
    }
}

@Controller()
class SubscriptionController {
    constructor(private readonly db: PrismaService) {}
    @Post("account/subscription")
    @UseGuards(SessionGuard)
    async rotate(@CurrentUser() user: User) {
        const token = randomBytes(32).toString("base64url");
        await this.db.user.update({
            where: { id: user.id },
            data: { subscribeHash: sessionDigest(token) },
        });
        const base = `${getConfig().origin}/api/subscription/${token}`;
        return {
            mihomo: `${base}?format=mihomo`,
            singbox: `${base}?format=singbox`,
        };
    }
    @Get("subscription/:token")
    async subscription(
        @Param("token") token: string,
        @Query("format") format: string,
        @Res() reply: FastifyReply,
    ) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
            throw new UnauthorizedException();
        const user = await this.db.user.findUnique({
            where: { subscribeHash: sessionDigest(token) },
        });
        if (!user || !available(user))
            throw new UnauthorizedException("订阅不可用。");
        if (!["mihomo", "singbox"].includes(format))
            throw new BadRequestException("支持 mihomo 或 singbox。");
        const nodes = await this.db.node.findMany({
            where: { enabled: true, plans: { some: { planId: user.planId! } } },
            orderBy: { id: "asc" },
        });
        if (!nodes.length)
            throw new BadRequestException("当前套餐暂无可用节点。");
        reply.header(
            "subscription-userinfo",
            `upload=${user.upload}; download=${user.download}; total=${user.transferEnable}; expire=${user.expiredAt ?? 0}`,
        );
        reply.header(
            "content-disposition",
            'attachment; filename="xboard.json"',
        );
        // JSON is valid YAML and accepted by Mihomo; no interpolation of YAML strings.
        return reply
            .type("application/json")
            .send(
                format === "mihomo"
                    ? mihomo(nodes, user.proxyUuid)
                    : singbox(nodes, user.proxyUuid),
            );
    }
}

@Module({
    imports: [AuthModule],
    controllers: [UniProxyController, SubscriptionController, XrayRController],
    providers: [NodesService],
})
export class NodesModule {}
