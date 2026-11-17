import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/modules/auth/password";
import { createApp } from "../src/bootstrap";
import { appDirectory } from "../src/config";
import { PrismaService } from "../src/database/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";
import { sessionDigest } from "../src/modules/auth/auth.service";
import { randomBytes } from "node:crypto";
import { MailService } from "../src/modules/account/account.module";
import { createServer } from "node:net";
import { DatabaseRateLimit } from "../src/common/rate-limit";
import { Maintenance } from "../src/common/maintenance";

// Each run owns an isolated schema, with cleanup limited to that random name.
const testSchema = `test_${randomUUID().replaceAll("-", "")}`;

describe("development API slice", () => {
    let app: Awaited<ReturnType<typeof createApp>>["app"];
    let baseUrl = "";
    let prisma: PrismaService;
    let adminCookie = "";
    let normalCookie = "";
    let platformUser = 0;
    let platformPlan = 0;
    let platformNode = 0;
    let nodeToken = "";
    let subscriptionToken = "";

    before(async () => {
        process.env.NODE_ENV = "test";
        process.env.APP_ORIGIN = "http://127.0.0.1:5173";
        const url = new URL(
            process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
        );
        url.searchParams.set("schema", testSchema);
        process.env.DATABASE_URL = url.toString();
        const migrate = spawnSync(
            "pnpm",
            ["exec", "prisma", "migrate", "deploy"],
            {
                cwd: appDirectory,
                env: process.env,
                stdio: "pipe",
            },
        );
        assert.equal(migrate.status, 0, migrate.stderr?.toString());

        ({ app } = await createApp({ logging: false }));
        await app.listen(0, "127.0.0.1");
        baseUrl = await app.getUrl();
        prisma = app.get(PrismaService);
        const plan = await prisma.plan.create({
            data: {
                name: "测试套餐",
                content: "集成测试数据",
                transferEnable: 107_374_182_400n,
                speedLimit: 300,
                deviceLimit: 2,
                published: true,
                prices: {
                    create: [
                        { period: "monthly", amountMinor: 1990 },
                        { period: "yearly", amountMinor: 19900 },
                    ],
                },
            },
        });
        await prisma.user.create({
            data: {
                email: "tester@example.test",
                password: await hashPassword("correct-horse-battery"),
                planId: plan.id,
                transferEnable: plan.transferEnable,
                upload: 1_073_741_824n,
                download: 2_147_483_648n,
                balance: 500,
            },
        });
    });

    after(async () => {
        if (prisma)
            await prisma.$executeRawUnsafe(
                `DROP SCHEMA "${testSchema}" CASCADE`,
            );
        await app?.close();
    });

    const origin = { origin: "http://127.0.0.1:5173" };

    it("reports health without leaking configuration", async () => {
        const response = await fetch(`${baseUrl}/api/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            status: "ok",
            mode: "development",
        });
    });

    it("rejects state-changing requests from another origin", async () => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                origin: "http://evil.example",
            },
            body: JSON.stringify({
                email: "tester@example.test",
                password: "correct-horse-battery",
            }),
        });
        assert.equal(response.status, 403);
    });

    it("rejects a wrong password with a generic message", async () => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json", ...origin },
            body: JSON.stringify({
                email: "tester@example.test",
                password: "wrong",
            }),
        });
        assert.equal(response.status, 401);
        assert.match(JSON.stringify(await response.json()), /邮箱或密码不正确/);
    });

    it("requires a session for account and plans", async () => {
        assert.equal((await fetch(`${baseUrl}/api/account`)).status, 401);
        assert.equal((await fetch(`${baseUrl}/api/plans`)).status, 401);
    });

    it("registers an empty account and rejects duplicate identities", async () => {
        const input = {
            email: " NEW@example.test ",
            password: "new-account-password",
        };
        const register = () =>
            fetch(`${baseUrl}/api/auth/register`, {
                method: "POST",
                headers: { "content-type": "application/json", ...origin },
                body: JSON.stringify(input),
            });
        assert.equal((await register()).status, 201);
        assert.equal((await register()).status, 409);
        const user = await prisma.user.findUniqueOrThrow({
            where: { email: "new@example.test" },
        });
        assert.equal(user.planId, null);
        assert.equal(user.balance, 0);
        assert.equal(user.transferEnable, 0n);
        assert.match(user.password, /^scrypt-v1\$/);
        const login = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json", ...origin },
            body: JSON.stringify(input),
        });
        assert.equal(login.status, 200);
    });

    it("logs in, reads the account, then logs out", async () => {
        const login = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json", ...origin },
            body: JSON.stringify({
                email: "  TESTER@example.test ",
                password: "correct-horse-battery",
            }),
        });
        assert.equal(login.status, 200);
        const cookie = login.headers
            .getSetCookie()
            .find((value) => value.startsWith("xboard_session="))!
            .split(";")[0]!;
        assert.match(cookie, /^xboard_session=[A-Za-z0-9_-]{43}$/);

        const account = await fetch(`${baseUrl}/api/account`, {
            headers: { cookie },
        });
        assert.equal(account.status, 200);
        const body = (await account.json()) as {
            email: string;
            uploadBytes: string;
            transferBytes: string;
            balanceMinor: number;
        };
        assert.equal(body.email, "tester@example.test");
        assert.equal(body.uploadBytes, "1073741824");
        assert.equal(body.transferBytes, "107374182400");
        assert.equal(body.balanceMinor, 500);
        assert.ok(!("password" in body) && !("token" in body));

        const plans = await fetch(`${baseUrl}/api/plans`, {
            headers: { cookie },
        });
        assert.equal(plans.status, 200);
        const list = (await plans.json()) as Array<{
            prices: Array<{ period: string; amountMinor: number }>;
        }>;
        assert.equal(list.length, 1);
        assert.deepEqual(list[0]!.prices, [
            { period: "monthly", amountMinor: 1990 },
            { period: "yearly", amountMinor: 19900 },
        ]);

        const logout = await fetch(`${baseUrl}/api/auth/logout`, {
            method: "POST",
            headers: { cookie, ...origin },
        });
        assert.equal(logout.status, 204);
        assert.equal(
            (await fetch(`${baseUrl}/api/account`, { headers: { cookie } }))
                .status,
            401,
        );
    });

    it("snapshots prices, scopes orders and makes concurrent payments exactly once", async () => {
        const user = await prisma.user.create({
            data: {
                email: "buyer@example.test",
                password: await hashPassword("buyer-test-password"),
                balance: 10000,
            },
        });
        const session = await app
            .get(AuthService)
            .login(user.email, "buyer-test-password");
        const cookie = `xboard_session=${session.token}`;
        const post = (path: string, body?: unknown, auth = cookie) =>
            fetch(`${baseUrl}/api${path}`, {
                method: "POST",
                headers: {
                    ...origin,
                    cookie: auth,
                    ...(body ? { "content-type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
            });
        const plan = await prisma.plan.findFirstOrThrow();
        const input = {
            planId: plan.id,
            period: "monthly",
            requestId: randomUUID(),
        };
        const created = await post("/orders", input);
        assert.equal(created.status, 201);
        const order = (await created.json()) as {
            id: string;
            amountMinor: number;
        };
        assert.equal(order.amountMinor, 1990);
        const repeated = await post("/orders", input);
        assert.equal(((await repeated.json()) as { id: string }).id, order.id);
        assert.equal(
            (await post("/orders", { ...input, period: "yearly" })).status,
            409,
        );
        assert.equal(
            (await post("/orders", { ...input, requestId: randomUUID() }))
                .status,
            409,
        );
        const other = await app
            .get(AuthService)
            .login("new@example.test", "new-account-password");
        assert.equal(
            (
                await post(
                    `/orders/${order.id}/pay`,
                    undefined,
                    `xboard_session=${other.token}`,
                )
            ).status,
            404,
        );
        await prisma.planPrice.updateMany({
            where: { planId: plan.id, period: "monthly" },
            data: { amountMinor: 2500 },
        });
        const paid = await Promise.all([
            post(`/orders/${order.id}/pay`),
            post(`/orders/${order.id}/pay`),
        ]);
        assert.deepEqual(
            paid.map((response) => response.status),
            [200, 200],
        );
        const updated = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(updated.balance, 8010);
        assert.equal(updated.transferEnable, plan.transferEnable);
        assert.equal(updated.speedLimit, plan.speedLimit);
        assert.equal(
            await prisma.balanceEntry.count({ where: { orderId: order.id } }),
            1,
        );
        assert.equal((await post(`/orders/${order.id}/cancel`)).status, 409);

        const renew = await post("/orders", {
            ...input,
            requestId: randomUUID(),
        });
        const renewal = (await renew.json()) as { id: string };
        await post(`/orders/${renewal.id}/pay`);
        const renewed = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
        });
        assert.equal(renewed.expiredAt, updated.expiredAt! + 30 * 86400);
        assert.equal(renewed.transferEnable, plan.transferEnable * 2n);
        assert.equal(renewed.balance, 5510);
    });

    it("insufficient funds, cancellation and expiry never debit the balance", async () => {
        const user = await prisma.user.findUniqueOrThrow({
            where: { email: "new@example.test" },
        });
        const session = await app
            .get(AuthService)
            .login(user.email, "new-account-password");
        const post = (path: string, body?: unknown) =>
            fetch(`${baseUrl}/api${path}`, {
                method: "POST",
                headers: {
                    ...origin,
                    cookie: `xboard_session=${session.token}`,
                    ...(body ? { "content-type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
            });
        const plan = await prisma.plan.findFirstOrThrow();
        const input = {
            planId: plan.id,
            period: "monthly",
            requestId: randomUUID(),
        };
        const created = await post("/orders", input);
        const order = (await created.json()) as { id: string };
        assert.equal((await post(`/orders/${order.id}/pay`)).status, 400);
        assert.equal((await post(`/orders/${order.id}/cancel`)).status, 200);
        assert.equal((await post(`/orders/${order.id}/pay`)).status, 409);
        const next = await post("/orders", {
            ...input,
            requestId: randomUUID(),
        });
        const expired = (await next.json()) as { id: string };
        await prisma.order.update({
            where: { id: expired.id },
            data: { expiresAt: new Date(0) },
        });
        assert.equal((await post(`/orders/${expired.id}/pay`)).status, 409);
        assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
                .balance,
            0,
        );
        assert.equal(
            await prisma.balanceEntry.count({ where: { userId: user.id } }),
            0,
        );
    });

    async function platform(
        path: string,
        method = "GET",
        body?: unknown,
        cookie = adminCookie,
    ) {
        return fetch(`${baseUrl}/api${path}`, {
            method,
            headers: {
                ...origin,
                cookie,
                ...(body === undefined
                    ? {}
                    : { "content-type": "application/json" }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }

    it("enforces admin role and atomically audits idempotent manual credits", async () => {
        const auth = app.get(AuthService);
        await prisma.user.create({
            data: {
                email: "admin@example.test",
                password: await hashPassword("admin-test-password"),
                role: "admin",
            },
        });
        adminCookie = `xboard_session=${(await auth.login("admin@example.test", "admin-test-password")).token}`;
        const user = await prisma.user.create({
            data: {
                email: "platform@example.test",
                password: await hashPassword("platform-password"),
            },
        });
        platformUser = user.id;
        normalCookie = `xboard_session=${(await auth.login(user.email, "platform-password")).token}`;
        assert.equal(
            (await platform("/admin/users", "GET", undefined, normalCookie))
                .status,
            403,
        );
        const input = {
            amountMinor: 5000,
            requestId: randomUUID(),
            reason: "offline receipt test",
        };
        const credits = await Promise.all([
            platform(`/admin/users/${user.id}/credit`, "POST", input),
            platform(`/admin/users/${user.id}/credit`, "POST", input),
        ]);
        assert.deepEqual(
            credits.map((r) => r.status),
            [201, 201],
        );
        assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
                .balance,
            5000,
        );
        assert.equal(
            await prisma.balanceEntry.count({
                where: { requestId: input.requestId },
            }),
            1,
        );
        assert.equal(
            await prisma.audit.count({
                where: { action: "balance.credit", target: String(user.id) },
            }),
            1,
        );
        assert.equal(
            (
                await platform(`/admin/users/${user.id}/credit`, "POST", {
                    ...input,
                    amountMinor: 1,
                })
            ).status,
            409,
        );
        const response = await platform("/admin/users");
        assert.equal(response.status, 200);
        const users = (await response.json()) as Record<string, unknown>[];
        assert.ok(
            users.every(
                (user) => !("password" in user) && !("proxyUuid" in user),
            ),
        );
    });

    it("creates a plan and scoped node then serves compatible config and subscription", async () => {
        const planResponse = await platform("/admin/plans", "POST", {
            name: "Platform plan",
            content: "test",
            transferBytes: "107374182400",
            speedLimit: 100,
            deviceLimit: 2,
            published: true,
            sort: 0,
            prices: [{ period: "monthly", amountMinor: 1000 }],
        });
        assert.equal(planResponse.status, 201);
        platformPlan = ((await planResponse.json()) as { id: number }).id;
        const nodeResponse = await platform("/admin/nodes", "POST", {
            name: "Test node",
            protocol: "vless",
            host: "node.example.test",
            port: 443,
            serverName: "node.example.test",
            cipher: "aes-128-gcm",
            enabled: true,
            planIds: [platformPlan],
        });
        assert.equal(nodeResponse.status, 201);
        const node = (await nodeResponse.json()) as {
            id: number;
            token: string;
        };
        platformNode = node.id;
        nodeToken = node.token;
        const orderResponse = await platform(
            "/orders",
            "POST",
            {
                planId: platformPlan,
                period: "monthly",
                requestId: randomUUID(),
            },
            normalCookie,
        );
        assert.equal(orderResponse.status, 201);
        const order = (await orderResponse.json()) as { id: string };
        assert.equal(
            (
                await platform(
                    `/orders/${order.id}/pay`,
                    "POST",
                    undefined,
                    normalCookie,
                )
            ).status,
            200,
        );
        const config = await fetch(
            `${baseUrl}/api/v1/server/UniProxy/config?node_id=${platformNode}&node_type=vless&token=${nodeToken}`,
        );
        assert.equal(config.status, 200);
        const configBody = (await config.json()) as {
            tls: number;
            server_port: number;
            base_config: { pull_interval: number };
        };
        assert.equal(configBody.tls, 1);
        assert.equal(configBody.server_port, 443);
        assert.equal(configBody.base_config.pull_interval, 60);
        const users = await fetch(
            `${baseUrl}/api/v1/server/UniProxy/user?node_id=${platformNode}&node_type=vless&token=${nodeToken}`,
        );
        const body = (await users.json()) as {
            users: { id: number; uuid: string }[];
        };
        assert.deepEqual(
            body.users.map((user) => user.id),
            [platformUser],
        );
        const subscription = await platform(
            "/account/subscription",
            "POST",
            undefined,
            normalCookie,
        );
        const links = (await subscription.json()) as {
            mihomo: string;
            singbox: string;
        };
        subscriptionToken = new URL(links.mihomo).pathname.split("/").at(-1)!;
        for (const format of ["mihomo", "singbox"]) {
            const sub = await fetch(
                `${baseUrl}/api/subscription/${subscriptionToken}?format=${format}`,
            );
            assert.equal(sub.status, 200);
            const body = (await sub.json()) as Record<string, unknown>;
            assert.ok(format === "mihomo" ? body.proxies : body.outbounds);
            assert.ok(!JSON.stringify(body).includes(nodeToken));
        }
        assert.equal(
            (
                await fetch(
                    `${baseUrl}/api/v1/server/UniProxy/config?node_id=${platformNode}&node_type=vless&token=wrong`,
                )
            ).status,
            401,
        );
        assert.equal(
            (
                await fetch(
                    `${baseUrl}/api/v1/server/UniProxy/config?node_id=${platformNode}&node_type=trojan&token=${nodeToken}`,
                )
            ).status,
            401,
        );
    });

    it("validates traffic, restricts node scope and optionally deduplicates report batches", async () => {
        const url = `${baseUrl}/api/v1/server/UniProxy`;
        const query = `?node_id=${platformNode}&node_type=vless&token=${nodeToken}`;
        const body = { [platformUser]: [100, 200], 1: [500, 500] };
        const send = (value: unknown, key?: string) =>
            fetch(`${url}/push${query}`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(key ? { "idempotency-key": key } : {}),
                },
                body: JSON.stringify(value),
            });
        const batch = randomUUID();
        assert.equal((await send(body, batch)).status, 201);
        assert.equal((await send(body, batch)).status, 201);
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: platformUser },
        });
        assert.equal(user.upload, 100n);
        assert.equal(user.download, 200n);
        assert.equal((await send({ [platformUser]: [-1, 2] })).status, 400);
        assert.equal(
            (await send({ [platformUser]: [1, 2] }, batch)).status,
            409,
        );
        const alive = await fetch(`${url}/alive${query}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                [platformUser]: ["192.0.2.1", "192.0.2.1"],
            }),
        });
        assert.equal(alive.status, 201);
        const list = await fetch(`${url}/alivelist${query}`);
        assert.deepEqual(await list.json(), { alive: { [platformUser]: 1 } });
        await platform(`/admin/users/${platformUser}/reset-traffic`, "POST", {
            reason: "support reset",
        });
        assert.equal(
            (
                await prisma.user.findUniqueOrThrow({
                    where: { id: platformUser },
                })
            ).upload,
            0n,
        );
        await platform(`/admin/users/${platformUser}/ban`, "POST", {
            banned: true,
        });
        assert.equal(
            (await platform("/account", "GET", undefined, normalCookie)).status,
            401,
        );
        assert.equal(
            (
                await fetch(
                    `${baseUrl}/api/subscription/${subscriptionToken}?format=mihomo`,
                )
            ).status,
            401,
        );
        await platform(`/admin/users/${platformUser}/ban`, "POST", {
            banned: false,
        });
        normalCookie = `xboard_session=${(await app.get(AuthService).login("platform@example.test", "platform-password")).token}`;
        await platform(
            "/account/subscription",
            "POST",
            undefined,
            normalCookie,
        );
        assert.equal(
            (
                await fetch(
                    `${baseUrl}/api/subscription/${subscriptionToken}?format=mihomo`,
                )
            ).status,
            401,
        );
    });

    it("publishes notices and protects ticket ownership and close state", async () => {
        const notice = await platform("/admin/notices", "POST", {
            title: "Maintenance",
            content: "Scheduled update",
            published: false,
        });
        const id = ((await notice.json()) as { id: number }).id;
        assert.deepEqual(
            await (
                await platform("/notices", "GET", undefined, normalCookie)
            ).json(),
            [],
        );
        await platform(`/admin/notices/${id}`, "PUT", {
            title: "Maintenance",
            content: "Scheduled update",
            published: true,
        });
        assert.equal(
            (
                (await (
                    await platform("/notices", "GET", undefined, normalCookie)
                ).json()) as unknown[]
            ).length,
            1,
        );
        const created = await platform(
            "/tickets",
            "POST",
            { subject: "Connection question", content: "Please help" },
            normalCookie,
        );
        const ticket = (await created.json()) as { id: number };
        const other = `xboard_session=${(await app.get(AuthService).login("new@example.test", "new-account-password")).token}`;
        assert.equal(
            (
                await platform(
                    `/tickets/${ticket.id}/reply`,
                    "POST",
                    { content: "unauthorized" },
                    other,
                )
            ).status,
            404,
        );
        assert.equal(
            (
                await platform(`/tickets/${ticket.id}/reply`, "POST", {
                    content: "Support reply",
                })
            ).status,
            201,
        );
        await platform(
            `/tickets/${ticket.id}/status`,
            "POST",
            { closed: true },
            normalCookie,
        );
        assert.equal(
            (
                await platform(
                    `/tickets/${ticket.id}/reply`,
                    "POST",
                    { content: "closed" },
                    normalCookie,
                )
            ).status,
            400,
        );
        await platform(
            `/tickets/${ticket.id}/status`,
            "POST",
            { closed: false },
            normalCookie,
        );
        assert.equal(
            (
                await platform(
                    `/tickets/${ticket.id}/reply`,
                    "POST",
                    { content: "Thanks" },
                    normalCookie,
                )
            ).status,
            201,
        );
    });

    it("queues private email links, consumes them once and revokes sessions on reset", async () => {
        process.env.SMTP_HOST = "localhost";
        const verification = await platform(
            "/account/verify-email",
            "POST",
            undefined,
            normalCookie,
        );
        assert.equal(verification.status, 201);
        const mail = await prisma.mail.findFirstOrThrow({
            where: { to: "platform@example.test" },
            orderBy: { id: "desc" },
        });
        const verifyToken = /#verify:([A-Za-z0-9_-]{43})/.exec(mail.text)![1]!;
        assert.equal(
            (await platform("/auth/verify", "POST", { token: verifyToken }, ""))
                .status,
            201,
        );
        assert.equal(
            (await platform("/auth/verify", "POST", { token: verifyToken }, ""))
                .status,
            400,
        );
        await platform(
            "/auth/forgot",
            "POST",
            { email: "platform@example.test" },
            "",
        );
        const resetMail = await prisma.mail.findFirstOrThrow({
            where: { to: "platform@example.test" },
            orderBy: { id: "desc" },
        });
        const resetToken = /#reset:([A-Za-z0-9_-]{43})/.exec(
            resetMail.text,
        )![1]!;
        const reset = await platform(
            "/auth/reset",
            "POST",
            { token: resetToken, password: "new-platform-password" },
            "",
        );
        assert.equal(reset.status, 201);
        assert.equal(
            (await platform("/account", "GET", undefined, normalCookie)).status,
            401,
        );
        assert.equal(
            (
                await platform(
                    "/auth/reset",
                    "POST",
                    { token: resetToken, password: "another-password" },
                    "",
                )
            ).status,
            400,
        );
        const expired = randomBytes(32).toString("base64url");
        await prisma.emailToken.create({
            data: {
                hash: sessionDigest(expired),
                userId: platformUser,
                purpose: "verify",
                expiresAt: new Date(0),
            },
        });
        assert.equal(
            (await platform("/auth/verify", "POST", { token: expired }, ""))
                .status,
            400,
        );
        normalCookie = `xboard_session=${(await app.get(AuthService).login("platform@example.test", "new-platform-password")).token}`;
        assert.equal(
            (
                await platform(
                    "/account/password",
                    "POST",
                    { oldPassword: "wrong", password: "another-password" },
                    normalCookie,
                )
            ).status,
            400,
        );
        assert.equal(
            (
                await platform(
                    "/account/password",
                    "POST",
                    {
                        oldPassword: "new-platform-password",
                        password: "another-password",
                    },
                    normalCookie,
                )
            ).status,
            201,
        );
        assert.equal(
            (await platform("/account", "GET", undefined, normalCookie)).status,
            401,
        );
        delete process.env.SMTP_HOST;
    });

    it("adapts legacy XrayR Deepbwork users and traffic envelopes", async () => {
        const query = `?node_id=${platformNode}&token=${nodeToken}`;
        const response = await fetch(
            `${baseUrl}/api/v1/server/Deepbwork/config${query}`,
        );
        assert.equal(response.status, 200);
        const config = (await response.json()) as {
            inbound: { protocol: string; streamSettings: { security: string } };
        };
        assert.equal(config.inbound.protocol, "vless");
        assert.equal(config.inbound.streamSettings.security, "tls");
        const users = (await (
            await fetch(`${baseUrl}/api/v1/server/Deepbwork/user${query}`)
        ).json()) as { data: { id: number; v2ray_user: { uuid: string } }[] };
        assert.equal(users.data[0]!.id, platformUser);
        assert.match(users.data[0]!.v2ray_user.uuid, /^[a-f0-9-]{36}$/);
        const submit = await fetch(
            `${baseUrl}/api/v1/server/Deepbwork/submit${query}`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify([{ user_id: platformUser, u: 12, d: 34 }]),
            },
        );
        assert.equal(submit.status, 201);
        assert.equal(
            (
                await prisma.user.findUniqueOrThrow({
                    where: { id: platformUser },
                })
            ).upload,
            12n,
        );
        assert.equal(
            (await fetch(`${baseUrl}/api/v1/server/TrojanTidalab/user${query}`))
                .status,
            401,
        );
    });

    it("shares rate limits across storage instances and expires maintenance state", async () => {
        const first = new DatabaseRateLimit(prisma);
        const second = new DatabaseRateLimit(prisma);
        const key = randomUUID();
        const results = await Promise.all([
            first.increment(key, 10000, 2, 10000),
            second.increment(key, 10000, 2, 10000),
            first.increment(key, 10000, 2, 10000),
        ]);
        assert.equal(results.filter((result) => result.isBlocked).length, 1);
        await prisma.rateLimit.update({
            where: { key },
            data: { expiresAt: new Date(0), blockedUntil: new Date(0) },
        });
        await app.get(Maintenance).clean();
        assert.equal(
            await prisma.rateLimit.findUnique({ where: { key } }),
            null,
        );
    });

    it("delivers persisted email through SMTP and clears sensitive message bodies", async () => {
        const messages: string[] = [];
        const server = createServer((socket) => {
            let buffer = "";
            let data = false;
            socket.write("220 localhost test SMTP\r\n");
            socket.on("data", (chunk) => {
                buffer += chunk.toString();
                while (true) {
                    if (data) {
                        const end = buffer.indexOf("\r\n.\r\n");
                        if (end < 0) break;
                        messages.push(buffer.slice(0, end));
                        buffer = buffer.slice(end + 5);
                        data = false;
                        socket.write("250 Accepted\r\n");
                        continue;
                    }
                    const end = buffer.indexOf("\r\n");
                    if (end < 0) break;
                    const line = buffer.slice(0, end);
                    buffer = buffer.slice(end + 2);
                    if (/^EHLO|^HELO/.test(line))
                        socket.write("250 localhost\r\n");
                    else if (line === "DATA") {
                        data = true;
                        socket.write("354 Send data\r\n");
                    } else if (line === "QUIT") {
                        socket.end("221 Bye\r\n");
                        break;
                    } else socket.write("250 OK\r\n");
                }
            });
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
        );
        const address = server.address() as { port: number };
        const oldHost = process.env.SMTP_HOST,
            oldPort = process.env.SMTP_PORT;
        process.env.SMTP_HOST = "127.0.0.1";
        process.env.SMTP_PORT = String(address.port);
        try {
            const job = await prisma.mail.create({
                data: {
                    to: "smtp@example.test",
                    subject: "Delivery test",
                    text: "SMTP integration message",
                },
            });
            await app.get(MailService).flush();
            const delivered = await prisma.mail.findUniqueOrThrow({
                where: { id: job.id },
            });
            assert.ok(delivered.sentAt);
            assert.equal(delivered.text, "");
            assert.ok(
                messages.some((message) =>
                    message.includes("SMTP integration message"),
                ),
            );
        } finally {
            if (oldHost === undefined) delete process.env.SMTP_HOST;
            else process.env.SMTP_HOST = oldHost;
            if (oldPort === undefined) delete process.env.SMTP_PORT;
            else process.env.SMTP_PORT = oldPort;
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it("removes exhausted users and rejects disabled nodes", async () => {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: platformUser },
        });
        await prisma.user.update({
            where: { id: platformUser },
            data: { upload: user.transferEnable },
        });
        const url = `${baseUrl}/api/v1/server/UniProxy/user?node_id=${platformNode}&node_type=vless&token=${nodeToken}`;
        assert.deepEqual(await (await fetch(url)).json(), { users: [] });
        await prisma.user.update({
            where: { id: platformUser },
            data: { upload: user.upload },
        });
        await prisma.node.update({
            where: { id: platformNode },
            data: { enabled: false },
        });
        assert.equal((await fetch(url)).status, 401);
        await prisma.node.update({
            where: { id: platformNode },
            data: { enabled: true },
        });
    });

    it("accepts same-port loopback origins only in development", async () => {
        await prisma.rateLimit.deleteMany();
        const previousEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";
        let development:
            Awaited<ReturnType<typeof createApp>>["app"] | undefined;
        try {
            ({ app: development } = await createApp({ logging: false }));
            await development.listen(0, "127.0.0.1");
            const url = await development.getUrl();
            for (const [requestOrigin, expected] of [
                ["http://localhost:5173", 200],
                ["http://127.0.0.1:5173", 200],
                ["http://[::1]:5173", 200],
                ["http://localhost:5174", 403],
                ["https://evil.example", 403],
            ] as const) {
                const response = await fetch(`${url}/api/auth/login`, {
                    method: "POST",
                    headers: {
                        origin: requestOrigin,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        email: "admin@example.test",
                        password: "admin-test-password",
                    }),
                });
                assert.equal(response.status, expected, requestOrigin);
            }
        } finally {
            await development?.close();
            process.env.NODE_ENV = previousEnv;
        }
    });

    it("uses secure cookies and hides Swagger in production mode", async () => {
        await prisma.rateLimit.deleteMany();
        const previousEnv = process.env.NODE_ENV,
            previousOrigin = process.env.APP_ORIGIN;
        process.env.NODE_ENV = "production";
        process.env.APP_ORIGIN = "https://panel.example.test";
        let production:
            Awaited<ReturnType<typeof createApp>>["app"] | undefined;
        try {
            ({ app: production } = await createApp({ logging: false }));
            await production.listen(0, "127.0.0.1");
            const url = await production.getUrl();
            assert.equal(
                (
                    await fetch(`${url}/api/auth/login`, {
                        method: "POST",
                        headers: {
                            origin: "http://localhost:5173",
                            "content-type": "application/json",
                        },
                        body: JSON.stringify({
                            email: "admin@example.test",
                            password: "admin-test-password",
                        }),
                    })
                ).status,
                403,
            );
            const response = await fetch(`${url}/api/auth/login`, {
                method: "POST",
                headers: {
                    origin: "https://panel.example.test",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    email: "admin@example.test",
                    password: "admin-test-password",
                }),
            });
            assert.equal(response.status, 200);
            const cookies = response.headers.getSetCookie().join("; ");
            assert.match(cookies, /Secure/);
            assert.match(cookies, /HttpOnly/);
            assert.equal((await fetch(`${url}/api/docs`)).status, 404);
            assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), {
                status: "ok",
                mode: "production",
            });
        } finally {
            await production?.close();
            process.env.NODE_ENV = previousEnv;
            process.env.APP_ORIGIN = previousOrigin;
        }
    });
});
