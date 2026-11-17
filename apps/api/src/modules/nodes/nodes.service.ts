import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { Node, User } from "@prisma/client";
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { PrismaService } from "../../database/prisma.service";
import { sessionDigest } from "../auth/auth.service";

export function available(user: User) {
    return (
        !user.banned &&
        user.planId !== null &&
        (user.expiredAt === null ||
            user.expiredAt > Math.floor(Date.now() / 1000)) &&
        user.upload + user.download < user.transferEnable
    );
}

@Injectable()
export class NodesService {
    constructor(private readonly db: PrismaService) {}
    async authenticate(query: Record<string, unknown>) {
        const id = Number(query.node_id);
        const token = query.token;
        if (
            !Number.isSafeInteger(id) ||
            id < 1 ||
            typeof token !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(token)
        )
            throw new UnauthorizedException();
        const node = await this.db.node.findUnique({ where: { id } });
        const protocol =
            query.node_type === "v2ray" ? "vmess" : query.node_type;
        if (
            !node ||
            !node.enabled ||
            protocol !== node.protocol ||
            !timingSafeEqual(
                Buffer.from(node.tokenHash, "hex"),
                Buffer.from(sessionDigest(token), "hex"),
            )
        )
            throw new UnauthorizedException();
        await this.db.node.update({
            where: { id },
            data: { lastSeenAt: new Date() },
        });
        return node;
    }
    config(node: Node) {
        const common = {
            host: node.host,
            server_port: node.port,
            server_name: node.serverName || node.host,
            routes: [],
            base_config: { push_interval: 60, pull_interval: 60 },
        };
        switch (node.protocol) {
            case "vmess":
            case "vless":
                return {
                    ...common,
                    tls: 1,
                    tls_settings: { server_name: common.server_name },
                    network: "tcp",
                    network_settings: {},
                    flow: "",
                    encryption: "none",
                };
            case "shadowsocks":
                return { ...common, cipher: node.cipher };
            case "trojan":
                return { ...common, network: "tcp", networkSettings: {} };
            case "hysteria2":
                return {
                    ...common,
                    ignore_client_bandwidth: true,
                    obfs: "",
                    "obfs-password": "",
                };
            case "tuic":
                return {
                    ...common,
                    congestion_control: "bbr",
                    zero_rtt_handshake: false,
                };
        }
    }
    async users(nodeId: number) {
        const plans = await this.db.nodePlan.findMany({
            where: { nodeId },
            select: { planId: true },
        });
        const users = await this.db.user.findMany({
            where: {
                banned: false,
                planId: { in: plans.map((p) => p.planId) },
                OR: [
                    { expiredAt: null },
                    { expiredAt: { gt: Math.floor(Date.now() / 1000) } },
                ],
            },
        });
        return {
            users: users.filter(available).map((user) => ({
                id: user.id,
                uuid: user.proxyUuid,
                speed_limit: user.speedLimit ?? 0,
                device_limit: user.deviceLimit ?? 0,
            })),
        };
    }
    async traffic(node: Node, input: unknown, key?: string) {
        if (!input || typeof input !== "object" || Array.isArray(input))
            throw new BadRequestException("Invalid traffic map");
        const rows = Object.entries(input);
        if (
            rows.length > 5000 ||
            (key && (key.length > 128 || !/^[\w-]+$/.test(key)))
        )
            throw new BadRequestException();
        const records = rows
            .map(([id, values]) => {
                if (
                    !/^[1-9]\d*$/.test(id) ||
                    !Number.isSafeInteger(Number(id)) ||
                    !Array.isArray(values) ||
                    values.length !== 2 ||
                    !values.every(
                        (n) =>
                            Number.isSafeInteger(n) &&
                            n >= 0 &&
                            n <= 1000000000000000,
                    )
                )
                    throw new BadRequestException("Invalid traffic counters");
                return {
                    userId: Number(id),
                    upload: BigInt(values[0]),
                    download: BigInt(values[1]),
                };
            })
            .sort((a, b) => a.userId - b.userId);
        const digest = createHash("sha256")
            .update(JSON.stringify(input))
            .digest("hex");
        await this.db.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Node" WHERE id = ${node.id} FOR UPDATE`;
                if (key) {
                    const receipt = await tx.trafficReceipt.findUnique({
                        where: { nodeId_key: { nodeId: node.id, key } },
                    });
                    if (receipt) {
                        if (receipt.digest !== digest)
                            throw new ConflictException(
                                "Batch key already used",
                            );
                        return;
                    }
                }
                const plans = (
                    await tx.nodePlan.findMany({ where: { nodeId: node.id } })
                ).map((p) => p.planId);
                for (const row of records) {
                    if (row.upload === 0n && row.download === 0n) continue;
                    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${row.userId} FOR UPDATE`;
                    const user = await tx.user.findUnique({
                        where: { id: row.userId },
                    });
                    if (
                        !user ||
                        user.planId === null ||
                        !plans.includes(user.planId)
                    )
                        continue;
                    await tx.user.update({
                        where: { id: row.userId },
                        data: {
                            upload: { increment: row.upload },
                            download: { increment: row.download },
                        },
                    });
                    await tx.trafficRecord.create({
                        data: { ...row, nodeId: node.id },
                    });
                }
                if (key)
                    await tx.trafficReceipt.create({
                        data: { nodeId: node.id, key, digest },
                    });
            },
            { timeout: 30000 },
        );
        return { data: true };
    }
    async alive(nodeId: number, input: unknown) {
        if (!input || typeof input !== "object" || Array.isArray(input))
            throw new BadRequestException();
        const allowed = new Set(
            (await this.users(nodeId)).users.map((user) => user.id),
        );
        const entries = Object.entries(input);
        if (entries.length > 5000) throw new BadRequestException();
        const data: {
            nodeId: number;
            userId: number;
            ip: string;
            seenAt: Date;
        }[] = [];
        for (const [id, ips] of entries) {
            if (
                !Array.isArray(ips) ||
                ips.length > 1000 ||
                ips.some((ip) => typeof ip !== "string" || !isIP(ip))
            )
                throw new BadRequestException();
            if (allowed.has(Number(id)))
                for (const ip of new Set<string>(ips))
                    data.push({
                        nodeId,
                        userId: Number(id),
                        ip,
                        seenAt: new Date(),
                    });
        }
        await this.db.$transaction([
            this.db.onlineDevice.deleteMany({ where: { nodeId } }),
            this.db.onlineDevice.createMany({ data, skipDuplicates: true }),
        ]);
        return { data: true };
    }
    async aliveList(nodeId: number) {
        const allowed = (await this.users(nodeId)).users.map((user) => user.id);
        const devices = await this.db.onlineDevice.findMany({
            where: {
                userId: { in: allowed },
                seenAt: { gt: new Date(Date.now() - 180000) },
            },
        });
        const users = new Map<number, Set<string>>();
        for (const device of devices) {
            if (!users.has(device.userId)) users.set(device.userId, new Set());
            users.get(device.userId)!.add(device.ip);
        }
        return {
            alive: Object.fromEntries(
                [...users].map(([id, ips]) => [id, ips.size]),
            ),
        };
    }
}
