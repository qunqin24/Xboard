import { randomUUID } from "node:crypto";
import type { Order, User, Withdrawal } from "@prisma/client";
import {
    commissionSettingsBody,
    type CommissionAmount,
    type CommissionWithdrawal,
    type WithdrawalReview,
} from "@xboard/contracts";
import { db, lockUser, type Tx } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { audit } from "../admin/shared";
import { MAX_BALANCE_MINOR } from "../orders/credit";
import {
    openApplicationSecret,
    sealApplicationSecret,
} from "../system/secrets";

export async function commissionSettings(tx: Tx = db) {
    const rows = await tx.setting.findMany({
        where: { key: { in: Object.keys(commissionSettingsBody.shape) } },
    });
    return commissionSettingsBody.parse(
        Object.fromEntries(rows.map(({ key, value }) => [key, value])),
    );
}

export async function saveCommissionSettings(
    tx: Tx,
    actorId: number,
    raw: unknown,
) {
    const parsed = commissionSettingsBody.safeParse(raw);
    if (!parsed.success) throw badRequest("佣金设置格式不正确。");
    const config = parsed.data;
    if (config.withdrawEnabled && config.withdrawMethods.length === 0)
        throw badRequest("开放提现前须填写至少一种收款方式。");
    if (new Set(config.withdrawMethods).size !== config.withdrawMethods.length)
        throw badRequest("收款方式不能重复。");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('settings:commission'))::text`;
    for (const [key, value] of Object.entries(config))
        await tx.setting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
        });
    await audit(tx, actorId, "commission.settings", "commission", config);
    return config;
}

/** Award the inviter within the existing buyer/order transaction. Additions never spend a balance. */
export async function awardCommission(
    tx: Tx,
    buyer: User,
    order: Order,
    payableMinor: number,
) {
    const inviter = buyer.invitedById;
    if (!inviter || inviter === buyer.id || payableMinor <= 0) return;
    const config = await commissionSettings(tx);
    if (!config.commissionEnabled || config.commissionRateBasisPoints === 0)
        return;
    if (
        !(await tx.user.findFirst({
            where: { id: inviter, banned: false },
            select: { id: true },
        }))
    )
        return;
    if (config.commissionFirstOrderOnly) {
        const [earlier] = await tx.$queryRaw<{ found: boolean }[]>`
            SELECT EXISTS (
                SELECT 1 FROM "Order"
                WHERE "userId" = ${buyer.id} AND status = 'paid' AND id <> ${order.id}::uuid
                    AND "amountMinor" > "creditMinor" + "discountMinor"
            ) AS found
        `;
        if (earlier?.found) return;
    }
    const amountMinor = Math.floor(
        (payableMinor * config.commissionRateBasisPoints) / 10_000,
    );
    if (!amountMinor) return;
    await tx.commissionEntry.create({
        data: {
            userId: inviter,
            orderId: order.id,
            kind: "reward",
            amountMinor,
        },
    });
    await audit(tx, 0, "commission.reward", order.id, {
        userId: inviter,
        amountMinor,
    });
}

async function available(tx: Tx, userId: number) {
    const [row] = await tx.$queryRaw<{ total: bigint }[]>`
        SELECT COALESCE(sum("amountMinor"), 0) AS total FROM "CommissionEntry" WHERE "userId" = ${userId}
    `;
    return Number(row?.total ?? 0n);
}

export function withdrawalView(row: Withdrawal) {
    const { id, amountMinor, method, status, reason, createdAt } = row;
    return {
        id,
        amountMinor,
        method,
        status,
        reason,
        createdAt: createdAt.toISOString(),
    };
}

export async function myCommission(userId: number) {
    const [settings, availableMinor, entries, withdrawals] = await Promise.all([
        commissionSettings(),
        available(db, userId),
        db.commissionEntry.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 30,
        }),
        db.withdrawal.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 30,
        }),
    ]);
    return {
        enabled: settings.commissionEnabled,
        withdrawEnabled: settings.withdrawEnabled,
        withdrawMinMinor: settings.withdrawMinMinor,
        methods: settings.withdrawMethods,
        availableMinor,
        entries: entries.map(({ id, kind, amountMinor, createdAt }) => ({
            id,
            kind,
            amountMinor,
            createdAt: createdAt.toISOString(),
        })),
        withdrawals: withdrawals.map(withdrawalView),
    };
}

async function reservedRequest(
    tx: Tx,
    userId: number,
    input: CommissionAmount,
) {
    return tx.commissionEntry.findUnique({
        where: { userId_requestId: { userId, requestId: input.requestId } },
    });
}

export function transferCommission(userId: number, input: CommissionAmount) {
    return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const prior = await reservedRequest(tx, userId, input);
        if (prior) {
            if (
                prior.kind !== "transfer" ||
                prior.amountMinor !== -input.amountMinor
            )
                throw conflict("请求编号已用于另一笔佣金操作。");
            return { ok: true as const };
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.banned) throw conflict("账户不可用。");
        if ((await available(tx, userId)) < input.amountMinor)
            throw badRequest("可用佣金不足。");
        if (user.balance + input.amountMinor > MAX_BALANCE_MINOR)
            throw badRequest("余额超过上限。");
        await tx.commissionEntry.create({
            data: {
                userId,
                requestId: input.requestId,
                kind: "transfer",
                amountMinor: -input.amountMinor,
            },
        });
        await tx.user.update({
            where: { id: userId },
            data: { balance: { increment: input.amountMinor } },
        });
        await tx.balanceEntry.create({
            data: {
                userId,
                requestId: input.requestId,
                amountMinor: input.amountMinor,
                reason: "邀请佣金转入",
            },
        });
        await audit(tx, userId, "commission.transfer", userId, {
            amountMinor: input.amountMinor,
        });
        return { ok: true as const };
    });
}

export function receiver(row: Withdrawal) {
    return openApplicationSecret(
        `withdrawal:${row.id}`,
        row.recipient,
    ).toString("utf8");
}

export function requestWithdrawal(userId: number, input: CommissionWithdrawal) {
    return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const prior = await reservedRequest(tx, userId, input);
        if (prior) {
            const existing =
                prior.withdrawalId &&
                (await tx.withdrawal.findUnique({
                    where: { id: prior.withdrawalId },
                }));
            if (
                !existing ||
                existing.amountMinor !== input.amountMinor ||
                existing.method !== input.method ||
                receiver(existing) !== input.recipient
            )
                throw conflict("请求编号已用于另一笔佣金操作。");
            return withdrawalView(existing);
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.banned) throw conflict("账户不可用。");
        const settings = await commissionSettings(tx);
        if (!settings.withdrawEnabled) throw badRequest("当前未开放提现。");
        if (!settings.withdrawMethods.includes(input.method))
            throw badRequest("该收款方式不可用。");
        if (input.amountMinor < settings.withdrawMinMinor)
            throw badRequest("提现金额低于最低限额。");
        if ((await available(tx, userId)) < input.amountMinor)
            throw badRequest("可用佣金不足。");
        const id = randomUUID();
        const row = await tx.withdrawal.create({
            data: {
                id,
                userId,
                requestId: input.requestId,
                amountMinor: input.amountMinor,
                method: input.method,
                recipient: sealApplicationSecret(
                    `withdrawal:${id}`,
                    Buffer.from(input.recipient),
                ),
            },
        });
        await tx.commissionEntry.create({
            data: {
                userId,
                withdrawalId: id,
                requestId: input.requestId,
                kind: "withdrawal",
                amountMinor: -input.amountMinor,
            },
        });
        await audit(tx, userId, "commission.withdrawal_request", id, {
            amountMinor: input.amountMinor,
            method: input.method,
        });
        return withdrawalView(row);
    });
}

export async function reviewWithdrawal(
    tx: Tx,
    actorId: number,
    id: string,
    input: WithdrawalReview,
) {
    const existing = await tx.withdrawal.findUnique({ where: { id } });
    if (!existing) throw notFound("提现申请不存在。");
    await lockUser(tx, existing.userId);
    const request = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
    if (request.status !== "pending") {
        if (request.status !== input.status || request.reason !== input.reason)
            throw conflict("此申请已审核。");
        return withdrawalView(request);
    }
    if (input.status === "rejected")
        await tx.commissionEntry.create({
            data: {
                userId: request.userId,
                withdrawalId: id,
                kind: "reversal",
                amountMinor: request.amountMinor,
            },
        });
    const reviewed = await tx.withdrawal.update({
        where: { id },
        data: { ...input, reviewedBy: actorId, reviewedAt: new Date() },
    });
    await audit(tx, actorId, "commission.withdrawal_review", id, {
        userId: request.userId,
        status: input.status,
        amountMinor: request.amountMinor,
    });
    return withdrawalView(reviewed);
}
