import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { Order, Prisma, User } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CreateOrderDto, OrderDto } from "./orders.dto";

const duration = { monthly: 30, quarterly: 90, yearly: 365 };

function dto(order: Order): OrderDto {
    return {
        id: order.id,
        planName: order.planName,
        period: order.period,
        status: order.status,
        amountMinor: order.amountMinor,
        transferBytes: order.transferBytes.toString(),
        durationDays: order.durationDays,
        createdAt: order.createdAt.toISOString(),
        expiresAt: order.expiresAt.toISOString(),
    };
}

@Injectable()
export class OrdersService {
    constructor(private readonly prisma: PrismaService) {}

    // All order mutations for a user take this lock, including cancellation.
    // A concurrent payment cannot double-debit or overwrite another entitlement.
    private async lock(tx: Prisma.TransactionClient, userId: number) {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.banned) throw new ConflictException("账户不可用。");
        return user;
    }

    private canPurchase(user: User, planId: number) {
        const active =
            user.planId !== null &&
            (user.expiredAt === null ||
                user.expiredAt > Math.floor(Date.now() / 1000));
        if (active && user.planId !== planId) {
            throw new ConflictException("当前套餐仍有效，请在到期后更换套餐。");
        }
        if (active && user.expiredAt === null) {
            throw new ConflictException("长期套餐无需续费。");
        }
        return active;
    }

    async create(userId: number, input: CreateOrderDto) {
        return this.prisma.$transaction(async (tx) => {
            const user = await this.lock(tx, userId);
            const existing = await tx.order.findUnique({
                where: {
                    userId_requestId: { userId, requestId: input.requestId },
                },
            });
            if (existing) {
                if (
                    existing.planId !== input.planId ||
                    existing.period !== input.period
                ) {
                    throw new ConflictException(
                        "同一请求编号不能用于不同订单。",
                    );
                }
                return dto(existing);
            }
            this.canPurchase(user, input.planId);
            await tx.order.updateMany({
                where: {
                    userId,
                    status: "pending",
                    expiresAt: { lte: new Date() },
                },
                data: { status: "cancelled" },
            });
            if (
                await tx.order.findFirst({
                    where: { userId, status: "pending" },
                })
            ) {
                throw new ConflictException("请先支付或取消待支付订单。");
            }
            const plan = await tx.plan.findUnique({
                where: { id: input.planId },
                include: { prices: true },
            });
            const price = plan?.prices.find((p) => p.period === input.period);
            if (
                !plan?.published ||
                !price ||
                price.currency !== "CNY" ||
                price.amountMinor < 0 ||
                plan.transferEnable <= 0n
            ) {
                throw new BadRequestException("该套餐或付款周期不可购买。");
            }
            return dto(
                await tx.order.create({
                    data: {
                        userId,
                        planId: plan.id,
                        requestId: input.requestId,
                        planName: plan.name,
                        period: input.period,
                        amountMinor: price.amountMinor,
                        transferBytes: plan.transferEnable,
                        speedLimit: plan.speedLimit,
                        deviceLimit: plan.deviceLimit,
                        durationDays: duration[input.period],
                        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                    },
                }),
            );
        });
    }

    async list(userId: number) {
        return (
            await this.prisma.order.findMany({
                where: { userId },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 50,
            })
        ).map(dto);
    }

    async change(userId: number, id: string, action: "pay" | "cancel") {
        return this.prisma.$transaction(async (tx) => {
            const user = await this.lock(tx, userId);
            const order = await tx.order.findFirst({ where: { id, userId } });
            if (!order) throw new NotFoundException("订单不存在。");
            if (action === "pay" && order.status === "paid") return dto(order);
            if (action === "cancel" && order.status === "cancelled")
                return dto(order);
            if (order.status !== "pending")
                throw new ConflictException("订单状态已改变，请刷新。");
            if (action === "cancel") {
                return dto(
                    await tx.order.update({
                        where: { id },
                        data: { status: "cancelled" },
                    }),
                );
            }
            if (order.expiresAt <= new Date())
                throw new ConflictException("订单已超时，请取消后重新下单。");
            const renewal = this.canPurchase(user, order.planId);
            if (user.balance < order.amountMinor)
                throw new BadRequestException("余额不足，暂未开放在线充值。");
            const now = Math.floor(Date.now() / 1000);
            await tx.user.update({
                where: { id: userId },
                data: {
                    balance: { decrement: order.amountMinor },
                    planId: order.planId,
                    expiredAt:
                        (renewal ? user.expiredAt! : now) +
                        order.durationDays * 86400,
                    // Quota belongs to the purchased term; renewal adds quota and time.
                    transferEnable: renewal
                        ? user.transferEnable + order.transferBytes
                        : order.transferBytes,
                    upload: renewal ? user.upload : 0n,
                    download: renewal ? user.download : 0n,
                    speedLimit: order.speedLimit,
                    deviceLimit: order.deviceLimit,
                },
            });
            await tx.balanceEntry.create({
                data: { userId, orderId: id, amountMinor: -order.amountMinor },
            });
            return dto(
                await tx.order.update({
                    where: { id },
                    data: { status: "paid", paidAt: new Date() },
                }),
            );
        });
    }
}
