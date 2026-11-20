// Regression tests for the issues fixed during the Express rewrite.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { after, before, describe, it } from "node:test";
import { z } from "zod";
import {
    accountSchema,
    adminLedgerSchema,
    adminNodeSchema,
    adminNoticeSchema,
    adminOrderSchema,
    adminPlanSchema,
    adminUserSchema,
    auditSchema,
    mailSchema,
    overviewSchema,
    pagedSchema,
    settingsSchema,
    statsSchema,
    subscriptionLinksSchema,
    ticketSchema,
    trafficDaySchema,
} from "@xboard/contracts";
import { db } from "../src/db";
import { flushMail } from "../src/jobs/mail-queue";
import { runMaintenance } from "../src/jobs/maintenance";
import { clientKey } from "../src/http/rate-limit";
import { sessionDigest } from "../src/modules/auth/service";
import { formatForUserAgent } from "../src/modules/nodes/subscription-routes";
import { setTestSmtp, startTestApp } from "./helpers";

type Harness = Awaited<ReturnType<typeof startTestApp>>;

describe("rate-limit subjects", () => {
    it("groups IPv6 clients by /64 and unwraps IPv4-mapped addresses", () => {
        assert.equal(clientKey("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
        assert.equal(
            clientKey("2001:db8:1:2:ffff:ffff:ffff:ffff"),
            "2001:db8:1:2::/64",
        );
        assert.notEqual(
            clientKey("2001:db8:1:3::1"),
            clientKey("2001:db8:1:2::1"),
        );
        assert.equal(clientKey("::1"), "0:0:0:0::/64");
        assert.equal(clientKey("::ffff:203.0.113.9"), "203.0.113.9");
        assert.equal(clientKey("fe80::1%en0"), "fe80:0:0:0::/64");
        assert.equal(clientKey("198.51.100.7"), "198.51.100.7");
    });
});

describe("subscription format detection", () => {
    it("serves sing-box JSON to sing-box based apps and Mihomo to the rest", () => {
        for (const ua of [
            "sing-box 1.11.0",
            "SFA/1.10.3 (Android)",
            "SFI/1.11 (iOS)",
            "HiddifyNext/2.5.7 (android) like ClashMeta v2ray sing-box",
            "Karing/1.1.2 (windows)",
        ])
            assert.equal(formatForUserAgent(ua), "singbox", ua);
        for (const ua of [
            "clash-verge/v2.0.3",
            "mihomo.party/v1.8.1 (clash.meta)",
            "FlClash/v0.8.80 clash-verge Platform/android",
            "Stash/2.7.6 Clash/1.11.0",
            "ClashMetaForAndroid/2.11.1.Meta",
            "Mozilla/5.0 (Macintosh) Safari/605.1.15",
            undefined,
        ])
            assert.equal(formatForUserAgent(ua), "mihomo", String(ua));
    });
});

describe("Express rewrite regressions", () => {
    let t: Harness;
    let admin = "";
    let planId = 0;

    before(async () => {
        t = await startTestApp();
        await t.createUser("root@example.test", "root-test-password", {
            role: "admin",
        });
        admin = await t.cookieFor("root@example.test", "root-test-password");
        const plan = await db.plan.create({
            data: {
                name: "Regression plan",
                transferEnable: 10n * 1024n ** 3n,
                published: true,
                prices: { create: [{ period: "monthly", amountMinor: 1000 }] },
            },
        });
        planId = plan.id;
    });
    after(async () => {
        await t?.stop();
    });

    it("locks a mailbox after 10 failed sign-ins, whatever the IP", async () => {
        await t.createUser("victim@example.test", "victim-password-ok");
        // Distinct per-IP buckets are simulated by clearing them; only the mailbox counter remains.
        for (let i = 0; i < 10; i++) {
            await db.rateLimit.deleteMany({
                where: { key: { startsWith: "ip:" } },
            });
            const r = await t.call("/auth/login", {
                body: { email: "victim@example.test", password: "wrong" },
            });
            assert.equal(r.status, 401);
        }
        await db.rateLimit.deleteMany({
            where: { key: { startsWith: "ip:" } },
        });
        const locked = await t.call("/auth/login", {
            body: { email: "Victim@example.test", password: "wrong" },
        });
        assert.equal(locked.status, 429);
        // Even the right password waits until the block ends.
        await db.rateLimit.deleteMany({
            where: { key: { startsWith: "ip:" } },
        });
        const right = await t.call("/auth/login", {
            body: {
                email: "victim@example.test",
                password: "victim-password-ok",
            },
        });
        assert.equal(right.status, 429);
        assert.match(JSON.stringify(await right.json()), /请求过于频繁/);
        await db.rateLimit.deleteMany();
    });

    it("rejects out-of-range ids with 400 instead of a database error", async () => {
        for (const path of [
            "/admin/users/99999999999",
            "/admin/users/0",
            "/admin/users/abc",
        ])
            assert.equal(
                (await t.call(path, { cookie: admin })).status,
                400,
                path,
            );
        assert.equal(
            (
                await t.call("/orders/not-a-uuid/pay", {
                    method: "POST",
                    cookie: admin,
                })
            ).status,
            400,
        );
        assert.equal(
            (await t.call("/admin/users/123456", { cookie: admin })).status,
            404,
        );
    });

    it("stores, keeps and returns expiry dates after 2038", async () => {
        const user = await t.createUser(
            "future@example.test",
            "future-password-1",
        );
        const expiredAt = Math.floor(Date.UTC(2040, 0, 15, 4) / 1000);
        const edit = await t.call(`/admin/users/${user.id}`, {
            method: "PUT",
            cookie: admin,
            body: {
                planId,
                expiredAt,
                transferBytes: "1073741824",
                speedLimit: null,
                deviceLimit: null,
            },
        });
        assert.equal(edit.status, 200);
        const cookie = await t.cookieFor(
            "future@example.test",
            "future-password-1",
        );
        const account = accountSchema.parse(
            await (await t.call("/account", { cookie })).json(),
        );
        assert.equal(account.expiredAt, expiredAt);
        const viaAdmin = adminUserSchema.parse(
            await (
                await t.call(`/admin/users/${user.id}`, { cookie: admin })
            ).json(),
        );
        assert.equal(viaAdmin.expiredAt, expiredAt);
    });

    it("refuses to pay an order whose plan was deleted after ordering", async () => {
        const plan = await db.plan.create({
            data: {
                name: "Short-lived",
                transferEnable: 1n << 30n,
                published: true,
                prices: { create: [{ period: "monthly", amountMinor: 100 }] },
            },
        });
        await t.createUser("buyer2@example.test", "buyer2-password-1", {
            balance: 1000,
        });
        const cookie = await t.cookieFor(
            "buyer2@example.test",
            "buyer2-password-1",
        );
        const order = (await (
            await t.call("/orders", {
                cookie,
                body: {
                    planId: plan.id,
                    period: "monthly",
                    requestId: randomUUID(),
                },
            })
        ).json()) as { id: string };
        assert.equal(
            (
                await t.call(`/admin/plans/${plan.id}`, {
                    method: "DELETE",
                    cookie: admin,
                })
            ).status,
            200,
        );
        const pay = await t.call(`/orders/${order.id}/pay`, {
            method: "POST",
            cookie,
        });
        assert.equal(pay.status, 400);
        const buyer = await db.user.findUniqueOrThrow({
            where: { email: "buyer2@example.test" },
        });
        assert.equal(buyer.balance, 1000);
        assert.equal(buyer.planId, null);
    });

    it("keeps tickets private on the customer routes and lets staff reply on admin routes", async () => {
        await t.createUser("alice@example.test", "alice-password-1");
        await t.createUser("bob@example.test", "bob-password-123");
        const alice = await t.cookieFor(
            "alice@example.test",
            "alice-password-1",
        );
        const bob = await t.cookieFor("bob@example.test", "bob-password-123");
        const ticket = ticketSchema.parse(
            await (
                await t.call("/tickets", {
                    cookie: alice,
                    body: { subject: "Help", content: "Alice here" },
                })
            ).json(),
        );
        assert.deepEqual(
            await (await t.call("/tickets", { cookie: bob })).json(),
            [],
        );
        // An admin on the customer route sees only their own tickets too.
        assert.deepEqual(
            await (await t.call("/tickets", { cookie: admin })).json(),
            [],
        );
        const close = await t.call(`/tickets/${ticket.id}/status`, {
            cookie: bob,
            body: { closed: true },
        });
        assert.equal(close.status, 404);
        const reply = await t.call(`/admin/tickets/${ticket.id}/reply`, {
            cookie: admin,
            body: { content: "Staff here" },
        });
        assert.equal(reply.status, 201);
        const thread = ticketSchema.parse(await reply.json());
        assert.deepEqual(
            thread.messages.map((m) => m.isStaff),
            [false, true],
        );
        const all = z
            .array(ticketSchema)
            .parse(
                await (
                    await t.call("/admin/tickets", { cookie: admin })
                ).json(),
            );
        assert.ok(all.some((row) => row.id === ticket.id));
        assert.equal(
            (await t.call("/admin/tickets", { cookie: alice })).status,
            403,
        );
    });

    it("pages and searches the admin user, order, ledger and audit lists", async () => {
        for (let i = 0; i < 5; i++)
            await t.createUser(`page${i}@example.test`, "page-password-123");
        const first = pagedSchema(adminUserSchema).parse(
            await (
                await t.call("/admin/users?q=PAGE&pageSize=2", {
                    cookie: admin,
                })
            ).json(),
        );
        assert.equal(first.total, 5);
        assert.equal(first.items.length, 2);
        const third = pagedSchema(adminUserSchema).parse(
            await (
                await t.call("/admin/users?q=page&pageSize=2&page=3", {
                    cookie: admin,
                })
            ).json(),
        );
        assert.equal(third.items.length, 1);
        const byId = pagedSchema(adminUserSchema).parse(
            await (
                await t.call(`/admin/users?q=${first.items[0]!.id}`, {
                    cookie: admin,
                })
            ).json(),
        );
        assert.ok(byId.items.some((user) => user.id === first.items[0]!.id));
        const banned = pagedSchema(adminUserSchema).parse(
            await (
                await t.call("/admin/users?status=banned", { cookie: admin })
            ).json(),
        );
        assert.equal(banned.total, 0);
        const either = pagedSchema(adminUserSchema).parse(
            await (
                await t.call("/admin/users?status=active,banned&role=user", {
                    cookie: admin,
                })
            ).json(),
        );
        assert.ok(
            either.total >= 5 &&
                either.items.every((user) => user.role === "user"),
        );
        assert.equal(
            (await t.call("/admin/users?status=deleted", { cookie: admin }))
                .status,
            400,
        );
        const unplanned = pagedSchema(adminUserSchema).parse(
            await (
                await t.call(
                    "/admin/users?q=page&plan=none&verified=unverified",
                    {
                        cookie: admin,
                    },
                )
            ).json(),
        );
        assert.equal(unplanned.total, 5);
        const onPlan = pagedSchema(adminUserSchema).parse(
            await (
                await t.call(`/admin/users?q=page&plan=${planId}`, {
                    cookie: admin,
                })
            ).json(),
        );
        assert.equal(onPlan.total, 0);
        assert.equal(
            (await t.call("/admin/users?pageSize=1000", { cookie: admin }))
                .status,
            400,
        );
        for (const [path, item] of [
            ["/admin/orders?status=cancelled", adminOrderSchema],
            ["/admin/ledger?q=example", adminLedgerSchema],
            ["/admin/audit?q=user.update", auditSchema],
            ["/admin/audit?action=user.ban,balance.credit", auditSchema],
            ["/admin/ledger?kind=credit", adminLedgerSchema],
            [
                "/admin/orders?q=Regression&status=paid,pending",
                adminOrderSchema,
            ],
        ] as const) {
            const response = await t.call(path, { cookie: admin });
            assert.equal(response.status, 200, path);
            pagedSchema(item).parse(await response.json());
        }
    });

    it("keeps one viewable subscription link until the user resets it", async () => {
        const user = await t.createUser(
            "sub@example.test",
            "sub-password-123",
            {
                planId,
                transferEnable: 1n << 30n,
            },
        );
        const cookie = await t.cookieFor(
            "sub@example.test",
            "sub-password-123",
        );
        const read = async () =>
            subscriptionLinksSchema.parse(
                await (
                    await t.call("/account/subscription", { cookie })
                ).json(),
            );
        const first = await read();
        assert.equal((await read()).url, first.url);
        // A valid token reaches the node lookup (400: no nodes); an unknown one is 401.
        const fetchStatus = async (url: string) =>
            (await fetch(url.replace(/^https?:\/\/[^/]+/, t.baseUrl))).status;
        assert.equal(await fetchStatus(first.url), 400);

        // A link issued before tokens were stored still works until a reset.
        const legacy = "L".repeat(43);
        await db.user.update({
            where: { id: user.id },
            data: { subscribeHash: sessionDigest(legacy) },
        });
        const legacyUrl = first.url.replace(/[^/]+$/, legacy);
        assert.equal(await fetchStatus(legacyUrl), 400);

        const reset = await t.call("/account/subscription", {
            method: "POST",
            cookie,
        });
        assert.equal(reset.status, 201);
        const next = subscriptionLinksSchema.parse(await reset.json());
        assert.notEqual(next.url, first.url);
        assert.equal((await read()).url, next.url);
        assert.equal(await fetchStatus(first.url), 401);
        assert.equal(await fetchStatus(legacyUrl), 401);
        assert.equal(await fetchStatus(next.url), 400);
    });

    it("rotates proxy credentials so nodes drop the old UUID", async () => {
        const user = await t.createUser(
            "rotate@example.test",
            "rotate-password-1",
        );
        const cookie = await t.cookieFor(
            "rotate@example.test",
            "rotate-password-1",
        );
        assert.equal(
            (await t.call("/account/credentials", { method: "POST", cookie }))
                .status,
            201,
        );
        const once = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.notEqual(once.proxyUuid, user.proxyUuid);
        assert.equal(
            (
                await t.call(`/admin/users/${user.id}/credentials`, {
                    method: "POST",
                    cookie: admin,
                })
            ).status,
            201,
        );
        const twice = await db.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.notEqual(twice.proxyUuid, once.proxyUuid);
        assert.ok(
            await db.audit.findFirst({
                where: {
                    action: "user.credentials_rotate",
                    target: String(user.id),
                },
            }),
        );
    });

    it("sends at most one reset mail a minute and keeps earlier links valid", async () => {
        await setTestSmtp("127.0.0.1");
        try {
            await t.createUser("forgot@example.test", "forgot-password-1");
            for (let i = 0; i < 2; i++)
                assert.equal(
                    (
                        await t.call("/auth/forgot", {
                            body: { email: "forgot@example.test" },
                        })
                    ).status,
                    201,
                );
            assert.equal(
                await db.mail.count({ where: { to: "forgot@example.test" } }),
                1,
            );
            // Pretend the first link is two minutes old: a new request now sends a second link.
            await db.emailToken.updateMany({
                data: { expiresAt: new Date(Date.now() + 28 * 60_000) },
            });
            await t.call("/auth/forgot", {
                body: { email: "forgot@example.test" },
            });
            const mails = await db.mail.findMany({
                where: { to: "forgot@example.test" },
                orderBy: { id: "asc" },
            });
            assert.equal(mails.length, 2);
            const firstToken = /#reset:([A-Za-z0-9_-]{43})/.exec(
                mails[0]!.text,
            )![1]!;
            const reset = await t.call("/auth/reset", {
                body: { token: firstToken, password: "forgot-password-2" },
            });
            assert.equal(reset.status, 201);
            assert.equal(
                await db.emailToken.count({
                    where: { user: { email: "forgot@example.test" } },
                }),
                0,
            );
        } finally {
            await setTestSmtp();
            await db.rateLimit.deleteMany();
        }
    });

    it("records why a mail failed and retries it later", async () => {
        const blocker = createServer();
        await new Promise<void>((resolve) =>
            blocker.listen(0, "127.0.0.1", resolve),
        );
        const port = (blocker.address() as { port: number }).port;
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
        await setTestSmtp("127.0.0.1", port);
        try {
            await db.mail.updateMany({ data: { sentAt: new Date() } });
            const job = await db.mail.create({
                data: { to: "x@example.test", subject: "S", text: "T" },
            });
            await flushMail();
            const failed = await db.mail.findUniqueOrThrow({
                where: { id: job.id },
            });
            assert.equal(failed.sentAt, null);
            assert.equal(failed.attempts, 1);
            assert.ok(failed.lastError && failed.lastError.length > 0);
            assert.ok(failed.nextAttempt.getTime() > Date.now() + 60_000);
            const listed = z
                .array(mailSchema)
                .parse(
                    await (
                        await t.call("/admin/mail", { cookie: admin })
                    ).json(),
                );
            assert.equal(
                listed.find((m) => m.id === job.id)?.lastError,
                failed.lastError,
            );
        } finally {
            await setTestSmtp();
        }
    });

    it("drops traffic records older than 180 days", async () => {
        const user = await t.createUser(
            "traffic@example.test",
            "traffic-password-1",
        );
        const node = await db.node.create({
            data: {
                name: "N",
                protocol: "vless",
                host: "n.example.test",
                port: 443,
                serverPort: 443,
                tokenHash: "00",
            },
        });
        const old = await db.trafficRecord.create({
            data: {
                nodeId: node.id,
                userId: user.id,
                upload: 1n,
                download: 1n,
                createdAt: new Date(Date.now() - 181 * 86_400_000),
            },
        });
        const recent = await db.trafficRecord.create({
            data: {
                nodeId: node.id,
                userId: user.id,
                upload: 1n,
                download: 1n,
                createdAt: new Date(Date.now() - 179 * 86_400_000),
            },
        });
        assert.deepEqual(await runMaintenance(), []);
        assert.equal(
            await db.trafficRecord.findUnique({ where: { id: old.id } }),
            null,
        );
        assert.ok(
            await db.trafficRecord.findUnique({ where: { id: recent.id } }),
        );
        // The overview counts live nodes only.
        await db.node.update({
            where: { id: node.id },
            data: { deletedAt: new Date() },
        });
        const overview = overviewSchema.parse(
            await (await t.call("/admin/overview", { cookie: admin })).json(),
        );
        assert.equal(overview.nodes, 0);
    });

    it("rejects unknown XrayR adapters, including Object prototype names", async () => {
        for (const adapter of [
            "constructor",
            "__proto__",
            "toString",
            "Nope",
        ]) {
            const response = await t.call(
                `/v1/server/${adapter}/user?node_id=1&token=${"a".repeat(43)}`,
            );
            assert.equal(response.status, 401, adapter);
        }
    });

    it("sums a user's own traffic per Shanghai day for the usage chart", async () => {
        const shanghai = new Date(Date.now() + 8 * 3_600_000);
        const midnight =
            Date.UTC(
                shanghai.getUTCFullYear(),
                shanghai.getUTCMonth(),
                shanghai.getUTCDate(),
            ) -
            8 * 3_600_000;
        const owner = await t.createUser(
            "daily@example.test",
            "daily-password-1",
        );
        const other = await t.createUser(
            "daily-other@example.test",
            "daily-password-2",
        );
        const node = await db.node.create({
            data: {
                name: "Daily",
                protocol: "vless",
                host: "daily.example.test",
                port: 443,
                serverPort: 443,
                tokenHash: "00",
            },
        });
        for (const [userId, at, upload, download] of [
            [owner.id, midnight - 1, 1n, 10n], // yesterday, 23:59:59.999
            [owner.id, midnight, 2n, 20n], // today, 00:00
            [owner.id, midnight + 60_000, 3n, 30n],
            [owner.id, midnight - 40 * 86_400_000, 9n, 9n], // outside the range
            [other.id, midnight + 60_000, 100n, 100n], // someone else
        ] as const)
            await db.trafficRecord.create({
                data: {
                    nodeId: node.id,
                    userId,
                    upload,
                    download,
                    createdAt: new Date(at),
                },
            });
        const cookie = await t.cookieFor(
            "daily@example.test",
            "daily-password-1",
        );
        const response = await t.call("/account/traffic/daily?days=2", {
            cookie,
        });
        assert.equal(response.status, 200);
        const days = z.array(trafficDaySchema).parse(await response.json());
        assert.deepEqual(
            days.map(({ upload, download }) => [upload, download]),
            [
                ["1", "10"],
                ["5", "50"],
            ],
        );
        // Every day is present, zero when nothing was reported.
        const week = z
            .array(trafficDaySchema)
            .parse(
                await (
                    await t.call("/account/traffic/daily", { cookie })
                ).json(),
            );
        assert.equal(week.length, 7);
        assert.deepEqual(
            week.slice(0, 5).map((day) => day.upload),
            ["0", "0", "0", "0", "0"],
        );
        assert.equal(
            (await t.call("/account/traffic/daily?days=31", { cookie })).status,
            400,
        );
        assert.equal((await t.call("/account/traffic/daily")).status, 401);
    });

    it("splits statistics at Shanghai midnight", async () => {
        const shanghai = new Date(Date.now() + 8 * 3_600_000);
        const midnight =
            Date.UTC(
                shanghai.getUTCFullYear(),
                shanghai.getUTCMonth(),
                shanghai.getUTCDate(),
            ) -
            8 * 3_600_000;
        const read = async () =>
            statsSchema.parse(
                await (
                    await t.call("/admin/stats?days=2", { cookie: admin })
                ).json(),
            );
        const before = await read();
        const buyer = await t.createUser(
            "stats@example.test",
            "stats-password-1",
        );
        for (const [paidAt, amountMinor] of [
            [midnight - 1, 1111],
            [midnight, 2222],
        ] as const)
            await db.order.create({
                data: {
                    userId: buyer.id,
                    planId,
                    requestId: randomUUID(),
                    status: "paid",
                    planName: "Regression plan",
                    period: "monthly",
                    amountMinor,
                    transferBytes: 1n,
                    durationDays: 30,
                    expiresAt: new Date(paidAt),
                    paidAt: new Date(paidAt),
                },
            });
        const afterStats = await read();
        assert.equal(
            afterStats.days[0]!.revenueMinor - before.days[0]!.revenueMinor,
            1111,
        );
        assert.equal(
            afterStats.days[1]!.revenueMinor - before.days[1]!.revenueMinor,
            2222,
        );
    });

    it("matches the shared contracts on every admin read endpoint", async () => {
        const cases = [
            ["/admin/overview", overviewSchema],
            ["/admin/plans", z.array(adminPlanSchema)],
            ["/admin/nodes", z.array(adminNodeSchema)],
            ["/admin/notices", z.array(adminNoticeSchema)],
            ["/admin/users", pagedSchema(adminUserSchema)],
            ["/admin/orders", pagedSchema(adminOrderSchema)],
            ["/admin/ledger", pagedSchema(adminLedgerSchema)],
            ["/admin/audit", pagedSchema(auditSchema)],
            ["/admin/mail", z.array(mailSchema)],
            ["/admin/settings", settingsSchema],
            ["/admin/stats", statsSchema],
            ["/admin/tickets", z.array(ticketSchema)],
        ] as const;
        for (const [path, schema] of cases) {
            const response = await t.call(path, { cookie: admin });
            assert.equal(response.status, 200, path);
            const result = (schema as z.ZodType).safeParse(
                await response.json(),
            );
            assert.ok(result.success, `${path}: ${result.error?.message}`);
        }
    });

    it("adds udp to Mihomo vmess and trojan proxies", async () => {
        const { entryFor, mihomo } =
            await import("../src/modules/nodes/subscription");
        const base = {
            host: "h.example.test",
            port: 443,
            serverPort: 443,
            settings: {},
            serverSecret: "0".repeat(32),
        };
        const config = mihomo(
            [
                { ...base, id: 1, name: "vm", protocol: "vmess" },
                { ...base, id: 2, name: "tr", protocol: "trojan" },
            ].map((node) => entryFor(node as never)),
            randomUUID(),
        ) as unknown as { proxies: { type: string; udp?: boolean }[] };
        assert.deepEqual(
            config.proxies.map((p) => [p.type, p.udp]),
            [
                ["vmess", true],
                ["trojan", true],
            ],
        );
    });
});
