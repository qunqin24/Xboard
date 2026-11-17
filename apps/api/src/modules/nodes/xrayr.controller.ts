import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Query,
    UnauthorizedException,
} from "@nestjs/common";
import { NodeProtocol } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { NodesService } from "./nodes.service";

// XrayR V2board adapter (Deepbwork/Tidalab), alongside the newer UniProxy API.
const protocols: Record<string, NodeProtocol[]> = {
    Deepbwork: ["vmess", "vless"],
    TrojanTidalab: ["trojan"],
    ShadowsocksTidalab: ["shadowsocks"],
};

@Controller("v1/server")
export class XrayRController {
    constructor(
        private readonly db: PrismaService,
        private readonly nodes: NodesService,
    ) {}
    private async node(adapter: string, query: Record<string, unknown>) {
        const id = Number(query.node_id);
        if (!protocols[adapter] || !Number.isSafeInteger(id) || id < 1)
            throw new UnauthorizedException();
        const node = await this.db.node.findUnique({ where: { id } });
        if (!node || !protocols[adapter]!.includes(node.protocol))
            throw new UnauthorizedException();
        return this.nodes.authenticate({ ...query, node_type: node.protocol });
    }
    @Get(":adapter/config")
    async config(
        @Param("adapter") adapter: string,
        @Query() query: Record<string, unknown>,
    ) {
        const node = await this.node(adapter, query);
        if (adapter === "TrojanTidalab")
            return {
                local_port: node.port,
                ssl: { sni: node.serverName || node.host },
            };
        if (adapter === "ShadowsocksTidalab")
            return { server_port: node.port, cipher: node.cipher };
        return {
            inbound: {
                port: node.port,
                protocol: node.protocol,
                settings: { clients: [] },
                streamSettings: {
                    network: "tcp",
                    security: "tls",
                    tlsSettings: { serverName: node.serverName || node.host },
                    tcpSettings: { header: { type: "none" } },
                },
            },
            routing: { rules: [] },
        };
    }
    @Get(":adapter/user")
    async users(
        @Param("adapter") adapter: string,
        @Query() query: Record<string, unknown>,
    ) {
        const node = await this.node(adapter, query);
        return {
            data: (await this.nodes.users(node.id)).users.map((user) => ({
                id: user.id,
                ...(adapter === "Deepbwork"
                    ? {
                          v2ray_user: {
                              uuid: user.uuid,
                              email: `${user.id}@xboard.local`,
                              alter_id: 0,
                          },
                      }
                    : adapter === "TrojanTidalab"
                      ? { trojan_user: { password: user.uuid } }
                      : {
                            secret: user.uuid,
                            cipher: node.cipher,
                            port: node.port,
                        }),
            })),
        };
    }
    @Post(":adapter/submit")
    async push(
        @Param("adapter") adapter: string,
        @Query() query: Record<string, unknown>,
        @Body() body: unknown,
        @Headers("idempotency-key") key?: string,
    ) {
        const node = await this.node(adapter, query);
        if (!Array.isArray(body) || body.length > 5000)
            throw new BadRequestException();
        const traffic: Record<string, unknown[]> = {};
        for (const item of body) {
            if (
                !item ||
                typeof item !== "object" ||
                !Number.isSafeInteger(item.user_id) ||
                item.user_id < 1 ||
                Object.hasOwn(traffic, item.user_id)
            )
                throw new BadRequestException();
            traffic[item.user_id] = [item.u, item.d];
        }
        return this.nodes.traffic(node, traffic, key);
    }
}
