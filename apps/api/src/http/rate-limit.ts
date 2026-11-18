import { isIPv4, isIPv6 } from "node:net";
import type { Request, RequestHandler } from "express";
import { db } from "../db";
import { HttpError } from "./errors";

export const TOO_MANY = "请求过于频繁，请稍后再试。";

/**
 * Fixed-window counter in PostgreSQL, so every API instance shares it.
 * More than `limit` hits within `windowMs` blocks the key for `blockMs`.
 * An advisory lock on the key serialises concurrent hits.
 */
export async function hitRateLimit(
    key: string,
    windowMs: number,
    limit: number,
    blockMs: number,
) {
    return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
        const now = Date.now();
        const old = await tx.rateLimit.findUnique({ where: { key } });
        const blocked = !!old?.blockedUntil && old.blockedUntil.getTime() > now;
        // A finished window or a lapsed block starts a fresh count.
        const reset =
            !old ||
            (!blocked &&
                (old.expiresAt.getTime() <= now || old.blockedUntil !== null));
        const hits = reset ? 1 : old.hits + 1;
        const expiresAt = reset ? new Date(now + windowMs) : old.expiresAt;
        const blockedUntil = blocked
            ? old.blockedUntil
            : hits > limit
              ? new Date(now + blockMs)
              : null;
        await tx.rateLimit.upsert({
            where: { key },
            create: { key, hits, expiresAt, blockedUntil },
            update: { hits, expiresAt, blockedUntil },
        });
        return {
            hits,
            blocked: blockedUntil !== null,
            retryAfterSeconds: blockedUntil
                ? Math.max(1, Math.ceil((blockedUntil.getTime() - now) / 1000))
                : 0,
        };
    });
}

/**
 * Give back one hit counted by `hitRateLimit`, for an attempt that turned out
 * to be legitimate. Does nothing while the key is blocked or already empty.
 */
export async function refundRateLimit(key: string) {
    await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
        await tx.rateLimit.updateMany({
            where: { key, hits: { gt: 0 }, blockedUntil: null },
            data: { hits: { decrement: 1 } },
        });
    });
}

/** Seconds left on a block for `key`, without counting a hit; 0 when free. */
export async function blockedFor(key: string): Promise<number> {
    const row = await db.rateLimit.findUnique({ where: { key } });
    const left = (row?.blockedUntil?.getTime() ?? 0) - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
}

export function tooMany(retryAfterSeconds: number) {
    return Object.assign(new HttpError(429, TOO_MANY), { retryAfterSeconds });
}

/** Count one hit and throw 429 when the key is over its limit. */
export async function enforce(
    key: string,
    windowMs: number,
    limit: number,
    blockMs = windowMs,
) {
    const result = await hitRateLimit(key, windowMs, limit, blockMs);
    if (result.blocked) throw tooMany(result.retryAfterSeconds);
}

/**
 * The client as a rate-limit subject. IPv6 users usually own a whole /64,
 * so counting single addresses would let one user rotate through billions.
 */
export function clientKey(ip: string | undefined): string {
    if (!ip) return "unknown";
    const address = ip.split("%")[0]!;
    if (isIPv4(address)) return address;
    if (!isIPv6(address)) return address;
    const groups = expandIPv6(address);
    // IPv4-mapped (::ffff:1.2.3.4) is the IPv4 client on a dual-stack socket.
    if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff)
        return `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
    return `${groups
        .slice(0, 4)
        .map((g) => g.toString(16))
        .join(":")}::/64`;
}

/** "2001:db8::1" → eight 16-bit numbers. Input must already pass isIPv6. */
export function expandIPv6(address: string): number[] {
    const toGroups = (part: string) =>
        part
            ? part.split(":").flatMap((group) => {
                  if (!group.includes(".")) return [parseInt(group, 16)];
                  const [a, b, c, d] = group.split(".").map(Number) as [
                      number,
                      number,
                      number,
                      number,
                  ];
                  return [(a << 8) | b, (c << 8) | d];
              })
            : [];
    const [head = "", tail] = address.split("::");
    const left = toGroups(head);
    const right = tail === undefined ? [] : toGroups(tail);
    const fill = tail === undefined ? 0 : 8 - left.length - right.length;
    return [...left, ...Array<number>(fill).fill(0), ...right];
}

/**
 * The endpoint a request hits, with ids and tokens collapsed, so that
 * "/api/orders/<uuid>/pay" and "/api/orders/<other>/pay" share one counter.
 */
export function endpointKey(req: Request): string {
    const path = req.path
        .split("/")
        .map((segment) =>
            /^\d+$/.test(segment)
                ? ":n"
                : segment.length >= 20
                  ? ":id"
                  : segment,
        )
        .join("/")
        .slice(0, 200);
    return `${req.method} ${path}`;
}

/**
 * Per-IP limit middleware. Without `scope`, each endpoint has its own counter
 * (the default 120 requests per minute); with it, all routes using the same
 * scope share one.
 */
export function rateLimit(options: {
    limit: number;
    windowMs: number;
    scope?: string;
}): RequestHandler {
    return async (req, res, next) => {
        const subject = options.scope ?? endpointKey(req);
        const result = await hitRateLimit(
            `ip:${subject}:${clientKey(req.ip)}`,
            options.windowMs,
            options.limit,
            options.windowMs,
        );
        if (result.blocked) {
            res.setHeader("Retry-After", String(result.retryAfterSeconds));
            throw tooMany(result.retryAfterSeconds);
        }
        next();
    };
}
