import { Router } from "express";
import { Prisma } from "@prisma/client";
import {
    statsQuery,
    type Overview,
    type Stats,
    type Rankings,
} from "@xboard/contracts";
import { db } from "../../db";
import { parse } from "../../http/validate";

export const statsRoutes = Router();

statsRoutes.get("/overview", async (_req, res) => {
    const [users, orders, nodes, openTickets, payments] = await Promise.all([
        db.user.count(),
        db.order.count(),
        db.node.count({ where: { deletedAt: null } }),
        db.ticket.count({ where: { closed: false } }),
        db.$queryRaw<{ revenue: bigint }[]>`
            SELECT COALESCE(SUM("amountMinor"::bigint - "creditMinor" - "discountMinor"), 0)::bigint AS revenue
            FROM "Order" WHERE status = 'paid'`,
    ]);
    const overview: Overview = {
        users,
        orders,
        nodes,
        openTickets,
        revenueMinor: Number(payments[0]?.revenue ?? 0),
    };
    res.json(overview);
});

/** A UTC timestamp column as an Asia/Shanghai calendar date. */
const local = (column: string) =>
    Prisma.raw(
        `("${column}" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date`,
    );
const firstOf = (count: number) =>
    Prisma.sql`((now() AT TIME ZONE 'Asia/Shanghai')::date - ${count - 1}::int)`;

/**
 * Daily totals for the last `days` days (Asia/Shanghai), oldest first, every
 * day present. Top plans cover the last `topDays` days (default: `days`).
 */
statsRoutes.get("/stats", async (req, res) => {
    const { days, topDays = days } = parse(statsQuery, req.query);
    const first = firstOf(days);
    const rows = await db.$queryRaw<
        {
            date: string;
            revenue: bigint;
            orders: bigint;
            users: bigint;
            traffic: string;
        }[]
    >`
        WITH day AS (
            SELECT generate_series(${first}, (now() AT TIME ZONE 'Asia/Shanghai')::date, interval '1 day')::date AS d
        ),
        paid AS (
            SELECT ${local("paidAt")} AS d, SUM("amountMinor"::bigint - "creditMinor" - "discountMinor") AS revenue, COUNT(*) AS orders
            FROM "Order" WHERE status = 'paid' AND "amountMinor" > 0 AND "paidAt" IS NOT NULL AND ${local("paidAt")} >= ${first}
            GROUP BY 1
        ),
        joined AS (
            SELECT ${local("createdAt")} AS d, COUNT(*) AS users
            FROM "User" WHERE ${local("createdAt")} >= ${first}
            GROUP BY 1
        ),
        used AS (
            SELECT ${local("createdAt")} AS d, SUM(upload::numeric + download) AS traffic
            FROM "TrafficRecord" WHERE ${local("createdAt")} >= ${first}
            GROUP BY 1
        )
        SELECT to_char(day.d, 'YYYY-MM-DD') AS date,
               COALESCE(paid.revenue, 0)::bigint AS revenue,
               COALESCE(paid.orders, 0)::bigint AS orders,
               COALESCE(joined.users, 0)::bigint AS users,
               COALESCE(used.traffic, 0)::text AS traffic
        FROM day
        LEFT JOIN paid ON paid.d = day.d
        LEFT JOIN joined ON joined.d = day.d
        LEFT JOIN used ON used.d = day.d
        ORDER BY day.d`;
    const top = await db.$queryRaw<
        { planName: string; orders: bigint; revenue: bigint }[]
    >`
        SELECT "planName", COUNT(*) AS orders, SUM("amountMinor"::bigint - "creditMinor" - "discountMinor")::bigint AS revenue
        FROM "Order"
        WHERE status = 'paid' AND kind = 'subscription' AND "amountMinor" > 0 AND "paidAt" IS NOT NULL AND ${local("paidAt")} >= ${firstOf(topDays)}
        GROUP BY "planName"
        ORDER BY revenue DESC, orders DESC
        LIMIT 5`;
    const stats: Stats = {
        days: rows.map((row) => ({
            date: row.date,
            revenueMinor: Number(row.revenue),
            paidOrders: Number(row.orders),
            newUsers: Number(row.users),
            trafficBytes: row.traffic,
        })),
        topPlans: top.map((row) => ({
            planName: row.planName,
            orders: Number(row.orders),
            revenueMinor: Number(row.revenue),
        })),
    };
    res.json(stats);
});

const rankingsQuery = statsQuery.pick({ days: true });
statsRoutes.get("/rankings", async (req, res) => {
    const { days } = parse(rankingsQuery, req.query);
    const cutoff = Prisma.sql`(${firstOf(days)}::timestamp AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC')`;
    const [users, nodes] = await db.$transaction([
        db.$queryRaw<Rankings["users"]>`
            SELECT u.id, u.email AS name, SUM(t.upload::numeric + t.download)::text AS "trafficBytes"
            FROM "TrafficRecord" t JOIN "User" u ON t."userId" = u.id
            WHERE t."createdAt" >= ${cutoff}
            GROUP BY u.id ORDER BY SUM(t.upload::numeric + t.download) DESC, u.id LIMIT 10`,
        db.$queryRaw<Rankings["nodes"]>`
            SELECT n.id, n.name, SUM(t.upload::numeric + t.download)::text AS "trafficBytes"
            FROM "TrafficRecord" t JOIN "Node" n ON t."nodeId" = n.id
            WHERE t."createdAt" >= ${cutoff}
            GROUP BY n.id ORDER BY SUM(t.upload::numeric + t.download) DESC, n.id LIMIT 10`,
    ]);
    res.json({ users, nodes } satisfies Rankings);
});
