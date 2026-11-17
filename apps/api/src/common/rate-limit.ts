import { Injectable } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class DatabaseRateLimit implements ThrottlerStorage {
    constructor(private readonly db: PrismaService) {}
    async increment(
        key: string,
        ttl: number,
        limit: number,
        blockDuration: number,
    ) {
        return this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
            const now = Date.now();
            const old = await tx.rateLimit.findUnique({ where: { key } });
            const blocked =
                old?.blockedUntil && old.blockedUntil.getTime() > now;
            const reset =
                !old ||
                (!blocked &&
                    (old.expiresAt.getTime() <= now ||
                        old.blockedUntil !== null));
            const hits = reset ? 1 : old.hits + 1;
            const expiresAt = reset ? new Date(now + ttl) : old.expiresAt;
            const blockedUntil = blocked
                ? old.blockedUntil
                : hits > limit
                  ? new Date(now + blockDuration)
                  : null;
            await tx.rateLimit.upsert({
                where: { key },
                create: { key, hits, expiresAt, blockedUntil },
                update: { hits, expiresAt, blockedUntil },
            });
            return {
                totalHits: hits,
                timeToExpire: Math.max(
                    0,
                    Math.ceil((expiresAt.getTime() - now) / 1000),
                ),
                isBlocked: !!blockedUntil,
                timeToBlockExpire: blockedUntil
                    ? Math.max(
                          0,
                          Math.ceil((blockedUntil.getTime() - now) / 1000),
                      )
                    : 0,
            };
        });
    }
}
