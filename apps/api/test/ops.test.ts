import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import {
    buildOpsOpenApi,
    opsEndpoints,
    opsTokenSchema,
} from "@xboard/contracts";
import { db } from "../src/db";
import { runMaintenance } from "../src/jobs/maintenance";
import { sessionDigest } from "../src/modules/auth/service";
import { startTestApp } from "./helpers";

describe("Bearer operations API", () => {
    let test: Awaited<ReturnType<typeof startTestApp>>;
    let admin: number;
    let user: number;
    let cookie: string;
    let userCookie: string;
    const password = "ops-test-password";

    before(async () => {
        process.env.TRUSTED_PROXY = "127.0.0.1";
        test = await startTestApp();
        const owner = await test.createUser("ops@example.test", password, {
            role: "admin",
        });
        const customer = await test.createUser(
            "ops-customer@example.test",
            password,
        );
        admin = owner.id;
        user = customer.id;
        cookie = await test.cookieFor(owner.email, password);
        userCookie = await test.cookieFor(customer.email, password);
    });
    after(async () => test?.stop());

    async function issue(
        name: string,
        options: { allowedIps?: string[]; scopes?: string[] } = {},
    ) {
        const response = await test.call("/admin/ops-tokens", {
            cookie,
            body: {
                name,
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                ...options,
            },
        });
        assert.equal(response.status, 201, await response.clone().text());
        return (await response.json()) as { id: string; token: string };
    }

    function call(
        path: string,
        options: {
            token?: string;
            method?: string;
            body?: unknown;
            key?: string;
            headers?: Record<string, string>;
        } = {},
    ) {
        const { token, method, body, key, headers } = options;
        return fetch(`${test.baseUrl}/api/ops/v1${path}`, {
            method: method ?? (body === undefined ? "GET" : "POST"),
            body: body === undefined ? undefined : JSON.stringify(body),
            headers: {
                ...(token && { authorization: `Bearer ${token}` }),
                ...(key && { "idempotency-key": key }),
                ...(body !== undefined && {
                    "content-type": "application/json",
                }),
                ...headers,
            },
        });
    }

    function calls(tokenId: string) {
        return db.audit.findMany({
            where: { opsTokenId: tokenId },
            orderBy: { id: "asc" },
            include: { opsChanges: true },
        });
    }

    it("issues and revokes tokens through the admin session and keeps plaintext out of list and storage", async () => {
        assert.equal(
            (await test.call("/admin/ops-tokens", { cookie: userCookie }))
                .status,
            403,
        );
        const invalid = await test.call("/admin/ops-tokens", {
            cookie,
            body: { name: "Expired", expiresAt: "2020-01-01T00:00:00Z" },
        });
        assert.equal(invalid.status, 400);

        const { id, token } = await issue("VPS");
        const row = await db.opsToken.findUniqueOrThrow({ where: { id } });
        assert.equal(row.tokenHash, sessionDigest(token));
        assert.notEqual(row.tokenHash, token);
        const list = await test.call("/admin/ops-tokens", { cookie });
        const body = await list.text();
        assert.equal(list.status, 200);
        assert.ok(!body.includes(token) && !body.includes(row.tokenHash));
        assert.deepEqual(opsTokenSchema.parse(JSON.parse(body)[0]).scopes, [
            "*",
        ]);

        assert.equal((await call("/overview", { token })).status, 200);
        assert.equal((await call("/ops-tokens", { token })).status, 404);
        assert.equal(
            (await call("/overview", { headers: { cookie } })).status,
            401,
        );
        assert.equal(
            (
                await test.call("/admin/overview", {
                    headers: { authorization: `Bearer ${token}` },
                })
            ).status,
            401,
        );
        assert.equal(
            (
                await test.call(`/admin/ops-tokens/${id}`, {
                    cookie,
                    method: "DELETE",
                })
            ).status,
            200,
        );
        assert.equal((await call("/overview", { token })).status, 401);
        const audited = await calls(id);
        assert.deepEqual(
            audited.map((item) => (item.detail as { status: number }).status),
            [200, 404, 401],
        );
        assert.ok(
            audited.every(
                (item) =>
                    item.actorId === admin && item.action === "ops.request",
            ),
        );
        const unknown = await db.audit.findFirst({
            where: { action: "ops.request", opsTokenId: null },
        });
        assert.equal(unknown?.target, "GET /api/ops/v1/overview");
    });

    it("rejects expired tokens, checks exact IPs, and enforces scopes", async () => {
        const expired = await issue("Expired");
        await db.opsToken.update({
            where: { id: expired.id },
            data: { expiresAt: new Date(0) },
        });
        assert.equal(
            (await call("/overview", { token: expired.token })).status,
            401,
        );
        const restricted = await issue("Restricted", {
            allowedIps: ["2001:db8::a", "192.0.2.10"],
            scopes: ["admin:read"],
        });
        assert.equal(
            (await call("/overview", { token: restricted.token })).status,
            403,
        );
        assert.equal(
            (
                await call("/overview", {
                    token: restricted.token,
                    headers: { "x-forwarded-for": "2001:0db8:0:0:0:0:0:a" },
                })
            ).status,
            200,
        );
        assert.equal(
            (
                await call("/overview", {
                    token: restricted.token,
                    headers: { "x-forwarded-for": "::ffff:192.0.2.10" },
                })
            ).status,
            200,
        );
        assert.equal(
            (
                await call(`/users/${user}/ban`, {
                    token: restricted.token,
                    key: randomUUID(),
                    body: { banned: true },
                    headers: { "x-forwarded-for": "192.0.2.10" },
                })
            ).status,
            403,
        );
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: user } })).banned,
            false,
        );
    });

    it("enforces a shared database limit per token, with Retry-After", async () => {
        const limited = await issue("Limited");
        const other = await issue("Separate");
        await db.rateLimit.create({
            data: {
                key: `ops:token:${limited.id}`,
                hits: 120,
                expiresAt: new Date(Date.now() + 60_000),
            },
        });
        const response = await call("/overview", { token: limited.token });
        assert.equal(response.status, 429);
        assert.ok(Number(response.headers.get("Retry-After")) > 0);
        assert.equal(
            (await call("/overview", { token: other.token })).status,
            200,
        );
        assert.equal((await calls(limited.id)).length, 1);
    });

    it("executes concurrent credits once, maintains the ledger, and filters the audit by token", async () => {
        const { id, token } = await issue("Credit");
        const key = randomUUID();
        const body = {
            requestId: key,
            amountMinor: 2500,
            reason: "Test receipt",
        };
        const responses = await Promise.all(
            Array.from({ length: 8 }, () =>
                call(`/users/${user}/credit`, {
                    token,
                    key,
                    body,
                    headers: {
                        origin: "https://another-origin.example",
                        "sec-fetch-site": "cross-site",
                    },
                }),
            ),
        );
        assert.deepEqual(
            responses.map((response) => response.status),
            Array(8).fill(201),
            await responses[0]!.clone().text(),
        );
        assert.equal(
            responses.filter(
                (response) =>
                    response.headers.get("Idempotency-Replayed") === "true",
            ).length,
            7,
        );
        const entries = await Promise.all(
            responses.map(
                async (response) => (await response.json()) as { id: string },
            ),
        );
        assert.ok(entries.every((entry) => entry.id === entries[0]?.id));
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: user } })).balance,
            2500,
        );
        assert.equal(
            await db.balanceEntry.count({ where: { userId: user } }),
            1,
        );
        assert.equal(
            (
                await call(`/users/${user}/credit`, {
                    token,
                    key,
                    body: {
                        reason: body.reason,
                        amountMinor: body.amountMinor,
                        requestId: key,
                    },
                })
            ).headers.get("Idempotency-Replayed"),
            "true",
        );
        assert.equal(
            (
                await call(`/users/${user}/credit`, {
                    token,
                    key,
                    body: { ...body, amountMinor: 3100 },
                })
            ).status,
            409,
        );
        assert.equal(
            (
                await call(`/users/${user}/ban`, {
                    token,
                    key,
                    body: { banned: true },
                })
            ).status,
            409,
        );
        const rows = await calls(id);
        assert.equal(rows.length, 11);
        assert.equal(rows.filter((row) => row.opsChanges.length).length, 1);
        const balance = rows
            .flatMap((row) => row.opsChanges)
            .find((row) => row.resource === "User");
        assert.deepEqual(balance?.before, { balance: 0 });
        assert.deepEqual(balance?.after, { balance: 2500 });
        const filter = await test.call(`/admin/audit?opsTokenId=${id}`, {
            cookie,
        });
        assert.equal(filter.status, 200);
        const audit = (await filter.json()) as {
            total: number;
            items: { opsTokenId: string; detail: unknown }[];
        };
        assert.equal(audit.total, rows.length);
        assert.ok(audit.items.every((row) => row.opsTokenId === id));
        assert.ok(JSON.stringify(audit).includes('"balance":2500'));
        assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: user } })).balance,
            2500,
        );
    });

    it("rolls back a failed operation and audits and replays its first business error", async () => {
        const { id, token } = await issue("Failures");
        const key = randomUUID();
        const body = {
            scope: "all",
            requestId: key,
            subject: "Ops example",
            text: "Broadcast test",
        };
        const first = await call("/mail/broadcast", { token, key, body });
        assert.equal(first.status, 400, await first.clone().text());
        const retry = await call("/mail/broadcast", { token, key, body });
        assert.equal(retry.headers.get("Idempotency-Replayed"), "true");
        assert.deepEqual(await retry.json(), await first.json());
        assert.equal(
            await db.mailBroadcast.count({ where: { requestId: key } }),
            0,
        );
        const rows = await calls(id);
        assert.deepEqual(
            rows.map(({ detail }) => (detail as { status: number }).status),
            [400, 400],
        );
        assert.ok(rows.every((row) => row.opsChanges.length === 0));
    });

    it("commits one offline settlement with the entitlement, both ledger entries and audit", async () => {
        const { id, token } = await issue("Settlement");
        const plan = await db.plan.create({
            data: {
                name: "Monthly",
                published: true,
                transferEnable: 10_737_418_240n,
                prices: { create: [{ period: "monthly", amountMinor: 1200 }] },
            },
        });
        const orderKey = randomUUID();
        const created = await call(`/users/${user}/orders`, {
            token,
            key: orderKey,
            body: { requestId: orderKey, planId: plan.id, period: "monthly" },
        });
        assert.equal(created.status, 201, await created.clone().text());
        const order = (await created.json()) as { id: string };
        const body = { amountMinor: 1200 };
        const key = randomUUID();
        const result = await Promise.all(
            Array.from({ length: 4 }, () =>
                call(`/orders/${order.id}/confirm-payment`, {
                    token,
                    key,
                    body,
                }),
            ),
        );
        assert.deepEqual(
            result.map((response) => response.status),
            [200, 200, 200, 200],
        );
        assert.equal(
            result.filter(
                (response) =>
                    response.headers.get("Idempotency-Replayed") === "true",
            ).length,
            3,
        );
        const buyer = await db.user.findUniqueOrThrow({ where: { id: user } });
        assert.equal(buyer.planId, plan.id);
        assert.equal(buyer.balance, 2500);
        const ledger = await db.balanceEntry.findMany({
            where: { userId: user, amountMinor: { in: [-1200, 1200] } },
            orderBy: { amountMinor: "asc" },
        });
        assert.deepEqual(
            ledger.map((entry) => entry.amountMinor),
            [-1200, 1200],
        );
        const audit = await calls(id);
        const settlement = audit.find((row) =>
            row.opsChanges.some((change) => change.resource === "BalanceEntry"),
        );
        assert.equal(
            settlement?.opsChanges.filter(
                (change) => change.resource === "BalanceEntry",
            ).length,
            2,
        );
        const orderChange = settlement?.opsChanges.find(
            (change) => change.resource === "Order",
        );
        assert.equal(
            (orderChange?.before as { status: string }).status,
            "pending",
        );
        assert.equal((orderChange?.after as { status: string }).status, "paid");
    });

    it("handles database conflicts and replays a one-time response without keeping secrets in plaintext", async () => {
        const { id, token } = await issue("Secret responses");
        const coupon = {
            code: "OPS_TEST",
            amountMinor: 100,
            maxUses: 1,
            expiresAt: null,
        };
        assert.equal(
            (await call("/coupons", { token, key: randomUUID(), body: coupon }))
                .status,
            201,
        );
        const conflictKey = randomUUID();
        const duplicate = await call("/coupons", {
            token,
            key: conflictKey,
            body: coupon,
        });
        assert.equal(duplicate.status, 409, await duplicate.clone().text());
        assert.equal(
            (
                await call("/coupons", {
                    token,
                    key: conflictKey,
                    body: coupon,
                })
            ).headers.get("Idempotency-Replayed"),
            "true",
        );
        const key = randomUUID();
        const rotate = { token, key, method: "POST" };
        const passwordPath = `/users/${user}/password`;
        const initial = await call(passwordPath, rotate);
        assert.equal(initial.status, 201, await initial.clone().text());
        const result = (await initial.json()) as { password: string };
        const replay = await call(passwordPath, rotate);
        assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
        assert.deepEqual(await replay.json(), result);
        const stored = await db.opsWriteRequest.findUniqueOrThrow({
            where: { tokenId_key: { tokenId: id, key } },
        });
        assert.ok(!Buffer.from(stored.response).includes(result.password));
        const audit = await calls(id);
        assert.ok(
            !JSON.stringify(audit.map((row) => row.detail)).includes(
                result.password,
            ),
        );
        const change = audit
            .flatMap((row) => row.opsChanges)
            .find((row) => row.privateFields.includes("password"));
        assert.deepEqual(change?.before, {});
        assert.deepEqual(change?.after, {});
        assert.equal(
            (
                await test.call(`/admin/ops-tokens/${id}`, {
                    cookie,
                    method: "DELETE",
                })
            ).status,
            200,
        );
        assert.equal((await call(passwordPath, rotate)).status, 401);
        assert.deepEqual(await runMaintenance(), []);
        assert.equal(
            await db.opsWriteRequest.count({ where: { tokenId: id } }),
            0,
        );
    });

    it("exposes every documented admin operation with Bearer and checks all writes before dispatch", async () => {
        const { token, id } = await issue("Endpoint coverage");
        const document = buildOpsOpenApi();
        assert.deepEqual(document.servers, [{ url: "/api/ops/v1" }]);
        assert.equal(
            Object.keys(document.paths).some((path) =>
                path.startsWith("/ops-tokens"),
            ),
            false,
        );
        const docs = readFileSync(
            new URL("../../../docs/ops-api.md", import.meta.url),
            "utf8",
        );
        const reference = [
            ...docs.matchAll(
                /^\| `(GET|POST|PUT|DELETE) (\/[^`?]+)(?:\?[^`]*)?` \|/gm,
            ),
        ];
        assert.equal(reference.length, opsEndpoints.length);
        for (const endpoint of opsEndpoints) {
            const path = endpoint.path
                .replace(":id", String(user))
                .replace(":key", "verify_email")
                .replace(":format", "mihomo");
            const method = endpoint.method.toUpperCase();
            const pathPattern = new RegExp(
                `^${endpoint.path.replace(/:\w+/g, "[^/]+")}$`,
            );
            assert.ok(
                reference.some(
                    ([, verb, route]) =>
                        verb === method && pathPattern.test(route!),
                ),
                `${method} ${endpoint.path} in docs/ops-api.md`,
            );
            const response = await call(path, { token, method });
            assert.equal(
                response.status,
                method === "GET" ? 200 : 400,
                `${method} ${path}: ${await response.clone().text()}`,
            );
            if (method === "GET" && endpoint.response) {
                assert.ok(
                    endpoint.response.safeParse(await response.json()).success,
                    path,
                );
            } else {
                assert.match(await response.text(), /Idempotency-Key/, path);
            }
            assert.ok(
                document.paths[endpoint.path.replace(/:(\w+)/g, "{$1}")]?.[
                    endpoint.method
                ],
                endpoint.path,
            );
        }
        assert.equal((await calls(id)).length, opsEndpoints.length);
    });
});
