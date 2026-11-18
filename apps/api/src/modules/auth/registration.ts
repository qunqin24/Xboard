import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Settings } from "@xboard/contracts";
import { db, type Tx } from "../../db";
import { badRequest, conflict, forbidden, HttpError } from "../../http/errors";
import {
    clientKey,
    hitRateLimit,
    refundRateLimit,
    tooMany,
} from "../../http/rate-limit";
import { audit } from "../admin/shared";
import { enqueueTemplate } from "../mail/templates";
import { readSettings } from "../site/service";
import { trafficSchedule } from "../account/traffic-cycle";
import { newToken } from "./service";
import { hashPassword } from "./password";

const DAY_MS = 86_400_000;
const CODE_TTL_MS = 10 * 60_000;
/** A new code for the same mailbox no sooner than this. */
export const CODE_COOLDOWN_MS = 60_000;
/** Wrong guesses before a code is void and a new one is needed. */
export const CODE_MAX_ATTEMPTS = 5;
/**
 * Wrong or unusable guesses per mailbox per day, across every code sent to it.
 * Without this, asking for a fresh code (which resets the per-code counter)
 * would allow 5 more guesses every minute.
 */
export const CODE_DAILY_ATTEMPTS = 15;
const TAKEN = "无法使用此邮箱注册，请登录或使用其他邮箱。";

/** 8 characters without 0/O/1/I/L, so codes survive being read aloud. */
const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newInviteCode(): string {
    let code = "";
    for (let i = 0; i < 8; i++)
        code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
    return code;
}

/**
 * The mailbox an address delivers to. Gmail ignores dots and anything after
 * "+", and googlemail.com is the same service; other providers differ, so
 * their addresses are kept as typed. `email` must already be normalised.
 */
export function mailboxKey(email: string): string {
    const at = email.lastIndexOf("@");
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    if (domain !== "gmail.com" && domain !== "googlemail.com") return email;
    return `${local.split("+")[0]!.replaceAll(".", "")}@gmail.com`;
}

/** Throw 400 when the admin's domain rule rejects the address. */
export function checkEmailDomain(email: string, settings: Settings) {
    if (settings.emailDomainMode === "off") return;
    const domain = email.slice(email.lastIndexOf("@") + 1);
    const listed = settings.emailDomains.some(
        (rule) => domain === rule || domain.endsWith(`.${rule}`),
    );
    if (settings.emailDomainMode === "deny" && listed)
        throw badRequest("不支持使用该邮箱域名注册，请更换邮箱。");
    if (settings.emailDomainMode === "allow" && !listed) {
        const shown = settings.emailDomains.slice(0, 5).join("、");
        const more = settings.emailDomains.length > 5 ? " 等" : "";
        throw badRequest(`仅支持以下邮箱注册：${shown}${more}。`);
    }
}

function codeDigest(email: string, code: string): string {
    return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

async function lockKey(tx: Tx, key: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
}

/** An account already owns this mailbox, or (when checked) its Gmail alias. */
async function mailboxTaken(tx: Tx, email: string, settings: Settings) {
    const found = await tx.user.findFirst({
        where: settings.gmailAliasCheck
            ? { OR: [{ email }, { emailKey: mailboxKey(email) }] }
            : { email },
        select: { id: true },
    });
    return found !== null;
}

/**
 * Mail a 6-digit sign-up code. A repeat within the cooldown sends nothing.
 * When the mailbox already has an account, a notice goes out instead of a
 * code, so the answer never reveals which addresses are registered.
 * Returns the seconds until another code may be requested.
 */
export async function sendRegisterCode(email: string): Promise<number> {
    const settings = await readSettings();
    if (!settings.registrationOpen) throw forbidden("暂未开放注册。");
    if (!settings.emailCodeRequired)
        throw badRequest("当前注册无需邮箱验证码。");
    checkEmailDomain(email, settings);
    return db.$transaction(async (tx) => {
        await lockKey(tx, `register-code:${email}`);
        const now = Date.now();
        const previous = await tx.registerCode.findUnique({
            where: { email },
        });
        const wait = previous
            ? previous.sentAt.getTime() + CODE_COOLDOWN_MS - now
            : 0;
        if (wait > 0) return Math.ceil(wait / 1000);

        const taken = await mailboxTaken(tx, email, settings);
        const code = String(randomInt(1_000_000)).padStart(6, "0");
        const record = {
            // A taken mailbox gets an unguessable digest: no code can match it.
            codeHash: codeDigest(email, taken ? newToken() : code),
            attempts: 0,
            expiresAt: new Date(now + CODE_TTL_MS),
            sentAt: new Date(now),
        };
        await tx.registerCode.upsert({
            where: { email },
            create: { email, ...record },
            update: record,
        });
        await enqueueTemplate(
            tx,
            taken ? "registration_taken" : "registration_code",
            email,
            taken
                ? { siteName: settings.siteName }
                : { siteName: settings.siteName, code },
        );
        return CODE_COOLDOWN_MS / 1000;
    });
}

/**
 * Check a sign-up code without using it up; each wrong guess counts toward
 * the limit. The code is consumed when the account is created.
 */
async function checkRegisterCode(email: string, code: string | undefined) {
    if (!code) throw badRequest("请输入邮箱验证码。");
    const digest = codeDigest(email, code);
    // Counted before the guess is checked (so parallel requests cannot exceed
    // the cap) and returned when the guess is right. Keyed by mailbox, so
    // Gmail aliases share it and resending codes does not reset it.
    const capKey = `register-code-fail:${mailboxKey(email)}`;
    const cap = await hitRateLimit(capKey, DAY_MS, CODE_DAILY_ATTEMPTS, DAY_MS);
    if (cap.blocked) throw tooMany(cap.retryAfterSeconds);
    const correct = await db.$transaction(async (tx) => {
        await lockKey(tx, `register-code:${email}`);
        const row = await tx.registerCode.findUnique({ where: { email } });
        if (
            !row ||
            row.expiresAt.getTime() <= Date.now() ||
            row.attempts >= CODE_MAX_ATTEMPTS
        )
            throw badRequest("验证码无效或已过期，请重新获取。");
        const ok = timingSafeEqual(
            Buffer.from(row.codeHash, "hex"),
            Buffer.from(digest, "hex"),
        );
        if (!ok)
            await tx.registerCode.update({
                where: { email },
                data: { attempts: { increment: 1 } },
            });
        return ok;
    });
    if (!correct) throw badRequest("验证码不正确。");
    await refundRateLimit(capKey);
    return digest;
}

/** The account whose invite code was given; null when none was given. */
async function findInviter(code: string | undefined, required: boolean) {
    if (!code) {
        if (required) throw forbidden("当前仅限邀请注册，请填写邀请码。");
        return null;
    }
    const inviter = await db.user.findUnique({
        where: { inviteCode: code },
        select: { id: true, banned: true },
    });
    if (!inviter || inviter.banned) throw badRequest("邀请码无效。");
    return inviter;
}

export type RegisterInput = {
    email: string;
    password: string;
    emailCode?: string;
    inviteCode?: string;
    acceptTerms?: boolean;
};

/**
 * Create an account. Cheap checks (settings, domain, terms, invite, code)
 * run before the password is hashed; the per-IP cap, alias check, code
 * consumption and trial grant share one transaction.
 */
export async function register(input: RegisterInput, ip: string | undefined) {
    const { email } = input;
    const settings = await readSettings();
    if (!settings.registrationOpen) throw forbidden("暂未开放注册。");
    checkEmailDomain(email, settings);
    const termsShown = settings.termsUrl !== "" || settings.privacyUrl !== "";
    if (termsShown && input.acceptTerms !== true)
        throw badRequest("请阅读并同意服务条款和隐私政策。");
    const inviter = await findInviter(input.inviteCode, settings.inviteOnly);
    const codeHash = settings.emailCodeRequired
        ? await checkRegisterCode(email, input.emailCode)
        : null;
    const password = await hashPassword(input.password);
    const network = clientKey(ip);
    const now = new Date();

    try {
        return await db.$transaction(async (tx) => {
            // Locks are always taken in this order: network, then mailbox.
            await lockKey(tx, `register-ip:${network}`);
            if (settings.registerIpDailyLimit > 0) {
                const recent = await tx.user.count({
                    where: {
                        registerIp: network,
                        createdAt: { gt: new Date(now.getTime() - DAY_MS) },
                    },
                });
                if (recent >= settings.registerIpDailyLimit)
                    throw new HttpError(
                        429,
                        "当前网络 24 小时内注册的账户已达上限，请稍后再试。",
                    );
            }
            await lockKey(tx, `register-mailbox:${mailboxKey(email)}`);
            if (await mailboxTaken(tx, email, settings)) throw conflict(TAKEN);
            if (codeHash) {
                const used = await tx.registerCode.deleteMany({
                    where: { email, codeHash, expiresAt: { gt: now } },
                });
                if (used.count !== 1)
                    throw badRequest("验证码已失效，请重新获取。");
            }
            const trial =
                settings.trialPlanId === null
                    ? null
                    : await tx.plan.findFirst({
                          where: { id: settings.trialPlanId, deletedAt: null },
                      });
            const user = await tx.user.create({
                data: {
                    email,
                    password,
                    emailKey: mailboxKey(email),
                    registerIp: network,
                    invitedById: inviter?.id ?? null,
                    termsAcceptedAt: termsShown ? now : null,
                    verifiedAt: codeHash ? now : null,
                    ...(trial && {
                        planId: trial.id,
                        ...trafficSchedule(trial.trafficResetMode, now),
                        transferEnable: trial.transferEnable,
                        speedLimit: trial.speedLimit,
                        deviceLimit: trial.deviceLimit,
                        expiredAt: new Date(
                            now.getTime() + settings.trialDays * DAY_MS,
                        ),
                    }),
                },
            });
            if (trial)
                await audit(tx, user.id, "trial.grant", `user:${user.id}`, {
                    planId: trial.id,
                    days: settings.trialDays,
                });
            return { email: user.email };
        });
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        )
            throw conflict(TAKEN);
        throw error;
    }
}
