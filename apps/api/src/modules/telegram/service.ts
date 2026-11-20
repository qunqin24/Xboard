import { translate, translateMessage } from "@xboard/contracts";
import { defaultLocale, validLocale } from "../site/language";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getConfig } from "../../config";
import { log } from "../../logging";
import { db, lockUser, type Tx } from "../../db";
import {
    badRequest,
    conflict,
    HttpError,
    unauthorized,
} from "../../http/errors";
import { audit } from "../admin/shared";
import {
    openApplicationSecret,
    sealApplicationSecret,
} from "../system/secrets";

const loginLifetime = 10 * 60_000;
const tokenKey = "telegramBotToken";
const webhookKey = "telegramWebhookSecret";
const usernameKey = "telegramBotUsername";
const telegramResult = z.object({ ok: z.literal(true), result: z.unknown() });
const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");

async function bot(
    token: string,
    method: string,
    body: Record<string, unknown> = {},
) {
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${token}/${method}`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
                redirect: "error",
                signal: AbortSignal.timeout(5_000),
            },
        );
        if (!response.ok) throw new Error("Bot API returned an error");
        return telegramResult.parse(await response.json()).result;
    } catch {
        throw new HttpError(502, "Telegram 暂不可用，请检查机器人设置。");
    }
}

async function setting(tx: Tx, key: string) {
    const value = (await tx.setting.findUnique({ where: { key } }))?.value;
    return typeof value === "string" ? value : null;
}
async function readSecret(tx: Tx, key: string) {
    const value = await setting(tx, key);
    return (
        value && openApplicationSecret(`setting:${key}`, value).toString("utf8")
    );
}
async function store(tx: Tx, key: string, value: string) {
    await tx.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
    });
}
async function storeSecret(tx: Tx, key: string, value: string) {
    await store(
        tx,
        key,
        sealApplicationSecret(`setting:${key}`, Buffer.from(value)),
    );
}

export function telegramEnabled(tx: Tx = db) {
    return setting(tx, tokenKey).then(Boolean);
}
export async function telegramSettings(tx: Tx = db) {
    const [tokenSet, username] = await Promise.all([
        telegramEnabled(tx),
        setting(tx, usernameKey),
    ]);
    return { tokenSet, username };
}

export async function configureTelegram(actorId: number, token: string | null) {
    return db.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('settings:telegram'))::text`;
            const prior = await readSecret(tx, tokenKey);
            if (!token) {
                // A token revoked in BotFather can no longer delete its webhook;
                // switching Telegram off must still work.
                if (prior)
                    await bot(prior, "deleteWebhook").catch(() =>
                        log("warn", "telegram.delete_webhook_failed"),
                    );
                await tx.setting.deleteMany({
                    where: { key: { in: [tokenKey, webhookKey] } },
                });
                await tx.telegramBinding.deleteMany();
                await tx.telegramNotice.deleteMany({ where: { sentAt: null } });
                await audit(tx, actorId, "telegram.settings", "telegram", {
                    enabled: false,
                });
                return { tokenSet: false, username: null };
            }
            const username = z
                .object({ username: z.string().regex(/^[A-Za-z0-9_]{5,32}$/) })
                .safeParse(await bot(token, "getMe"));
            if (!username.success)
                throw badRequest("Telegram 机器人名称无效。");
            const origin = getConfig().origin;
            const secret =
                (prior === token ? await readSecret(tx, webhookKey) : null) ||
                randomBytes(32).toString("base64url");
            const registered = await bot(token, "setWebhook", {
                url: `${origin}/api/telegram/webhook`,
                secret_token: secret,
                allowed_updates: ["message"],
            });
            if (registered !== true)
                throw badRequest("Telegram 未确认 webhook 设置。");
            const previousUsername = await setting(tx, usernameKey);
            if (
                previousUsername &&
                previousUsername !== username.data.username
            ) {
                await tx.telegramBinding.deleteMany();
                await tx.telegramNotice.deleteMany({ where: { sentAt: null } });
                await tx.user.updateMany({
                    where: { telegramChatId: { not: null } },
                    data: { telegramChatId: null },
                });
            }
            await storeSecret(tx, tokenKey, token);
            await storeSecret(tx, webhookKey, secret);
            await store(tx, usernameKey, username.data.username);
            await audit(tx, actorId, "telegram.settings", "telegram", {
                enabled: true,
                username: username.data.username,
            });
            return { tokenSet: true, username: username.data.username };
        },
        { timeout: 14_000 },
    );
}

export async function telegramAccount(userId: number) {
    const [enabled, account] = await Promise.all([
        telegramEnabled(),
        db.user.findUniqueOrThrow({
            where: { id: userId },
            select: { telegramChatId: true },
        }),
    ]);
    return { enabled, linked: account.telegramChatId !== null };
}

export async function createTelegramLink(userId: number) {
    return db.$transaction(async (tx) => {
        const state = await telegramSettings(tx);
        if (!state.tokenSet || !state.username)
            throw conflict("站点尚未启用 Telegram。");
        await lockUser(tx, userId);
        const token = randomBytes(24).toString("base64url");
        const expiresAt = new Date(Date.now() + loginLifetime);
        await tx.telegramBinding.upsert({
            where: { userId },
            create: { userId, digest: digest(token), expiresAt },
            update: { digest: digest(token), expiresAt },
        });
        return {
            url: `https://t.me/${state.username}?start=${token}`,
            expiresAt: expiresAt.toISOString(),
        };
    });
}

export async function disconnectTelegram(userId: number) {
    return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        await tx.telegramBinding.deleteMany({ where: { userId } });
        await tx.user.update({
            where: { id: userId },
            data: { telegramChatId: null },
        });
        await audit(tx, userId, "telegram.disconnect", userId);
        return { ok: true as const };
    });
}

const updateMessage = z.object({
    message: z
        .object({
            chat: z.object({
                type: z.string(),
                id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            }),
            text: z.string().optional(),
        })
        .optional(),
});

async function bindChat(chatId: string, value: string) {
    const hash = digest(value);
    return db.$transaction(async (tx) => {
        const binding = await tx.telegramBinding.findUnique({
            where: { digest: hash },
        });
        if (!binding || binding.expiresAt <= new Date())
            return "绑定链接已过期，请回到面板重新生成。";
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram-chat:${chatId}`}))::text`;
        await lockUser(tx, binding.userId);
        const stillValid = await tx.telegramBinding.findUnique({
            where: { digest: hash },
        });
        const user = await tx.user.findUnique({
            where: { id: binding.userId },
        });
        if (
            !stillValid ||
            stillValid.expiresAt <= new Date() ||
            !user ||
            user.banned
        )
            return "绑定链接已过期，请回到面板重新生成。";
        const current = await tx.user.findUnique({
            where: { telegramChatId: chatId },
        });
        if (current && current.id !== user.id)
            return "这个 Telegram 账户已经绑定。";
        await tx.user.update({
            where: { id: user.id },
            data: { telegramChatId: chatId },
        });
        await tx.telegramBinding.delete({ where: { userId: user.id } });
        await audit(tx, user.id, "telegram.connect", user.id);
        return translate(
            validLocale(user.locale) ?? (await defaultLocale(tx)),
            "绑定成功。发送 /status 查看流量和到期时间。",
        );
    });
}

async function subscription(chatId: string) {
    const user = await db.user.findUnique({
        where: { telegramChatId: chatId },
    });
    const locale = validLocale(user?.locale) ?? (await defaultLocale());
    if (!user || user.banned)
        return translate(locale, "请先在面板中绑定 Telegram。");
    if (user.planId === null) return translate(locale, "当前账户暂无套餐。");
    const gib = (value: bigint) =>
        `${(Number(value) / 1024 ** 3).toFixed(2)} GiB`;
    const date = user.expiredAt
        ? new Intl.DateTimeFormat(locale, {
              timeZone: "Asia/Shanghai",
              dateStyle: "medium",
          }).format(user.expiredAt)
        : translate(locale, "长期有效");
    return translate(locale, "已用流量 {0} / {1}\n到期时间 {2}", [
        gib(user.upload + user.download),
        gib(user.transferEnable),
        date,
    ]);
}

export async function processTelegramUpdate(signature: string, raw: unknown) {
    const [secret, token] = await Promise.all([
        readSecret(db, webhookKey),
        readSecret(db, tokenKey),
    ]);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(secret ?? "");
    if (
        !secret ||
        !token ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
    )
        throw unauthorized("Telegram webhook 验证失败。");
    const update = updateMessage.safeParse(raw);
    const message = update.success ? update.data.message : undefined;
    if (!message?.text || message.chat.type !== "private") return;
    const chatId = String(message.chat.id);
    const [command, value] = message.text.trim().split(/\s+/, 2);
    let text: string | undefined;
    if (command === "/start" && value && /^[A-Za-z0-9_-]{32}$/.test(value))
        text = await bindChat(chatId, value);
    else if (command === "/status") text = await subscription(chatId);
    else if (command === "/start" || command === "/help")
        text =
            "在面板的账户设置中绑定 Telegram，使用 /status 查看流量和到期时间。";
    // A failed reply (the user blocked the bot, say) must not fail the update,
    // or Telegram redelivers it over and over.
    if (text)
        await bot(token, "sendMessage", { chat_id: chatId, text }).catch(() =>
            log("warn", "telegram.reply_failed"),
        );
}

export async function enqueueTelegram(
    tx: Tx,
    eventKey: string,
    message: string,
) {
    if (!(await telegramEnabled(tx))) return;
    const admins = await tx.user.findMany({
        where: { role: "admin", banned: false, telegramChatId: { not: null } },
        select: { telegramChatId: true, locale: true },
    });
    if (!admins.length) return;
    const siteLocale = await defaultLocale(tx);
    await tx.telegramNotice.createMany({
        data: admins.map(({ telegramChatId, locale }) => ({
            chatId: telegramChatId!,
            eventKey,
            message: translateMessage(
                validLocale(locale) ?? siteLocale,
                message,
            ),
        })),
        skipDuplicates: true,
    });
}

export async function flushTelegram(now = new Date()) {
    const token = await readSecret(db, tokenKey);
    if (!token) return;
    for (let count = 0; count < 10; count++) {
        const sent = await db.$transaction(
            async (tx) => {
                const [entry] = await tx.$queryRaw<
                    {
                        id: string;
                        chatId: string;
                        message: string;
                        attempts: number;
                    }[]
                >`
                SELECT id, "chatId", message, attempts FROM "TelegramNotice"
                WHERE "sentAt" IS NULL AND "nextAt" <= ${now.toISOString()}::timestamp(3) AND attempts < 6
                ORDER BY "nextAt" LIMIT 1 FOR UPDATE SKIP LOCKED
            `;
                if (!entry) return false;
                const qualified = await tx.user.findFirst({
                    where: {
                        telegramChatId: entry.chatId,
                        role: "admin",
                        banned: false,
                    },
                    select: { id: true },
                });
                try {
                    if (qualified)
                        await bot(token, "sendMessage", {
                            chat_id: entry.chatId,
                            text: entry.message,
                        });
                    await tx.telegramNotice.update({
                        where: { id: entry.id },
                        data: { sentAt: now },
                    });
                } catch {
                    await tx.telegramNotice.update({
                        where: { id: entry.id },
                        data: {
                            attempts: { increment: 1 },
                            nextAt: new Date(
                                now.getTime() + 30_000 * 2 ** entry.attempts,
                            ),
                        },
                    });
                }
                return true;
            },
            { timeout: 8_000 },
        );
        if (!sent) break;
    }
}
