import { db } from "../../db";
import { hitRateLimit, refundRateLimit, tooMany } from "../../http/rate-limit";

// Per-user limits on second-factor guesses, separate from the password
// counter. Every attempt is counted BEFORE the code is checked, so parallel
// requests cannot slip extra guesses past the limit; a correct code gives its
// hit back. Two tiers escalate: 5 wrong guesses lock the account's second
// factor for 15 minutes, 15 in a day lock it for 24 hours.
const SHORT = { windowMs: 15 * 60_000, limit: 5 };
const DAILY = { windowMs: 24 * 60 * 60_000, limit: 15 };

const shortKey = (userId: number) => `2fa-fail:${userId}`;
const dailyKey = (userId: number) => `2fa-fail-day:${userId}`;

/** Count one guess; throws 429 when the user is over either limit. */
export async function reserveTwoFactorAttempt(userId: number) {
    const short = await hitRateLimit(
        shortKey(userId),
        SHORT.windowMs,
        SHORT.limit,
        SHORT.windowMs,
    );
    if (short.blocked) throw tooMany(short.retryAfterSeconds);
    const daily = await hitRateLimit(
        dailyKey(userId),
        DAILY.windowMs,
        DAILY.limit,
        DAILY.windowMs,
    );
    if (daily.blocked) throw tooMany(daily.retryAfterSeconds);
}

/** The code was right: return the hit reserved for it. */
export async function releaseTwoFactorAttempt(userId: number) {
    await refundRateLimit(shortKey(userId));
    await refundRateLimit(dailyKey(userId));
}

/** An admin reset or a fresh setup starts the user from zero failures. */
export async function clearTwoFactorAttempts(userId: number) {
    await db.rateLimit.deleteMany({
        where: { key: { in: [shortKey(userId), dailyKey(userId)] } },
    });
}
