import { validLocale } from "../site/language";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { db, lockUser, type Tx } from "../../db";
import { HttpError, unauthorized } from "../../http/errors";
import { blockedFor, hitRateLimit, tooMany } from "../../http/rate-limit";
import { hashPassword, verifyPassword } from "./password";
import { factorUpdate } from "./totp";
import {
    releaseTwoFactorAttempt,
    reserveTwoFactorAttempt,
} from "./two-factor-limit";

export const SESSION_COOKIE = "xboard_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Unknown emails still pay for one scrypt run, so response time does not reveal accounts.
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

/** Sessions and email tokens are stored as SHA-256 digests, never raw. */
export function sessionDigest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
    return randomBytes(32).toString("base64url");
}

/**
 * Sign the user out everywhere and void pending email links. Call inside the
 * transaction that changes the password, role, ban or proxy credentials.
 */
export async function revokeAccess(tx: Tx, userId: number) {
    await tx.session.deleteMany({ where: { userId } });
    await tx.emailToken.deleteMany({ where: { userId } });
}

// Failed sign-ins per mailbox, on top of the per-IP limit: the 10th failure
// within 15 minutes locks the mailbox for 15 minutes, from any IP.
const FAILURE_WINDOW_MS = 15 * 60_000;
const FAILURES_BEFORE_LOCK = 10;

/** Check the password and open a session. `email` must already be normalised. */
export async function login(
    email: string,
    password: string,
    options: { twoFactorCode?: string; userAgent?: string } = {},
) {
    const failureKey = `login-fail:${email}`;
    const wait = await blockedFor(failureKey);
    if (wait > 0) throw tooMany(wait);

    const user = await db.user.findUnique({ where: { email } });
    const verified = await verifyPassword(
        password,
        user?.password ?? (await dummyHash),
    );
    const countFailure = () =>
        hitRateLimit(
            failureKey,
            FAILURE_WINDOW_MS,
            FAILURES_BEFORE_LOCK - 1,
            FAILURE_WINDOW_MS,
        );
    if (!user || !verified || user.banned) {
        await countFailure();
        throw unauthorized("邮箱或密码不正确，或账户不可用。");
    }
    const token = newToken();
    // Second-factor guesses have their own per-user counter, taken before the
    // code is checked. A wrong code never touches the password counter above.
    const guessing = user.totpSecret !== null && !!options.twoFactorCode;
    if (guessing) await reserveTwoFactorAttempt(user.id);
    await db.$transaction(async (tx) => {
        // A ban or password change between the check above and here wins.
        await lockUser(tx, user.id);
        const latest = await tx.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        if (latest.banned || latest.password !== user.password)
            throw unauthorized("账户状态已变化，请重试。");
        const now = new Date();
        let proof = {};
        if (latest.totpSecret) {
            if (!options.twoFactorCode)
                throw new HttpError(
                    401,
                    "请输入动态验证码或恢复码。",
                    "two_factor_required",
                );
            const update = factorUpdate(latest, options.twoFactorCode, now);
            if (!update)
                throw new HttpError(
                    401,
                    "动态验证码或恢复码无效。",
                    "two_factor_invalid",
                );
            proof = update;
        }
        await tx.session.create({
            data: {
                id: sessionDigest(token),
                userId: user.id,
                expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000),
                userAgent: options.userAgent?.trim().slice(0, 200) || null,
            },
        });
        await tx.user.update({
            where: { id: user.id },
            data: { lastLoginAt: now, ...proof },
        });
    });
    if (guessing) await releaseTwoFactorAttempt(user.id);
    return { token, email: user.email, locale: validLocale(user.locale) };
}

/** The signed-in user for a session cookie value; 401 otherwise. */
export async function authenticate(token: string | undefined): Promise<User> {
    if (!token || !TOKEN_PATTERN.test(token)) throw unauthorized("请先登录。");
    const session = await db.session.findUnique({
        where: { id: sessionDigest(token) },
        include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || session.user.banned)
        throw unauthorized("登录已失效，请重新登录。");
    return session.user;
}

export async function logout(token: string | undefined) {
    if (token)
        await db.session.deleteMany({ where: { id: sessionDigest(token) } });
}
