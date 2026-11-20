import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import {
    buildOpenApi,
    buildOpsOpenApi,
    OPS_API_PREFIX,
} from "@xboard/contracts";
import { getConfig } from "./config";
import { db } from "./db";
import { errorHandler, notFoundHandler } from "./http/errors";
import { originCheck } from "./http/origin";
import { rateLimit } from "./http/rate-limit";
import { securityHeaders } from "./http/security-headers";
import { webApp } from "./http/web";
import { requestLogging } from "./logging";
import { accountRoutes } from "./modules/account/routes";
import { securityRoutes } from "./modules/account/security";
import { adminRoutes } from "./modules/admin/routes";
import { authRoutes } from "./modules/auth/routes";
import { nodeRoutes } from "./modules/nodes/routes";
import { subscriptionRoutes } from "./modules/nodes/subscription-routes";
import { ruleListRoutes } from "./modules/templates/public-routes";
import { orderRoutes } from "./modules/orders/routes";
import { paymentsRoutes, paymentWebhooks } from "./modules/payments/routes";
import { planRoutes } from "./modules/plans/routes";
import { localeRoutes } from "./modules/site/locale";
import { siteRoutes } from "./modules/site/routes";
import { supportRoutes } from "./modules/support/routes";
import { helpRoutes } from "./modules/help/routes";
import { redemptionRoutes } from "./modules/promotions/routes";
import { opsRoutes } from "./modules/ops/routes";
import { commissionRoutes } from "./modules/commission/routes";
import { telegramRoutes, telegramWebhook } from "./modules/telegram/routes";
import { setupRoutes } from "./modules/system/setup";

/**
 * Build the HTTP app. Tests call this directly; server.ts adds listening,
 * shutdown and the background jobs.
 */
export function createApp(options: { logging?: boolean } = {}) {
    const config = getConfig();
    const app = express();

    app.set("trust proxy", config.trustProxy);
    // Byte counts are BigInt in Prisma; send them as decimal strings.
    app.set("json replacer", (_key: string, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
    );
    app.disable("x-powered-by");

    if (options.logging !== false) app.use(requestLogging);
    app.use(securityHeaders());
    app.use((_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
    });
    app.use(OPS_API_PREFIX, opsRoutes);
    app.use("/api/payments/webhooks", paymentWebhooks);
    app.use("/api/telegram", telegramWebhook);
    app.use(originCheck(config));
    app.use(cookieParser());
    app.use(express.json({ limit: "1mb" }));

    const api = express.Router();
    api.use(rateLimit({ limit: 120, windowMs: 60_000 }));
    api.get("/health", async (_req, res) => {
        await db.$queryRaw`SELECT 1`;
        res.json({
            status: "ok",
            mode: config.production ? "production" : "development",
        });
    });
    if (!config.production) {
        // Interactive docs in development only; production answers 404 here.
        const document = buildOpenApi();
        api.get("/docs/openapi.json", (_req, res) => {
            res.json(document);
        });
        const opsDocument = buildOpsOpenApi();
        api.get("/docs/ops-openapi.json", (_req, res) => {
            res.json(opsDocument);
        });
        api.use(
            "/docs",
            docsSecurityHeaders,
            swaggerUi.serve,
            swaggerUi.setup(document),
        );
    }
    api.use(
        setupRoutes,
        authRoutes,
        accountRoutes,
        commissionRoutes,
        telegramRoutes,
        securityRoutes,
        planRoutes,
        orderRoutes,
        paymentsRoutes,
        supportRoutes,
        siteRoutes,
        localeRoutes,
        helpRoutes,
        redemptionRoutes,
    );
    api.use(subscriptionRoutes, ruleListRoutes, nodeRoutes);
    api.use("/admin", adminRoutes);
    api.use(notFoundHandler);

    app.use("/api", api);
    if (config.webDirectory) app.use(webApp(config.webDirectory));
    app.use(notFoundHandler);
    app.use(errorHandler);
    return handle(app);
}

export type App = ReturnType<typeof createApp>;

/** Swagger UI runs an inline bootstrap script, which helmet's default CSP blocks. */
const docsSecurityHeaders: express.RequestHandler = (_req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    );
    next();
};

/** A small listen/close wrapper; closing it never disconnects the shared database client. */
function handle(app: express.Express) {
    let server: Server | undefined;
    return {
        express: app,
        listen(port: number, host: string) {
            return new Promise<void>((resolve, reject) => {
                const started = app.listen(port, host, (error?: Error) =>
                    error ? reject(error) : resolve(),
                );
                server = started;
            });
        },
        getUrl() {
            const address = server?.address() as AddressInfo | null | undefined;
            if (!address) throw new Error("The app is not listening.");
            const host =
                address.family === "IPv6"
                    ? `[${address.address}]`
                    : address.address;
            return `http://${host}:${address.port}`;
        },
        close() {
            return new Promise<void>((resolve, reject) => {
                if (!server) return resolve();
                server.closeAllConnections();
                server.close((error) => (error ? reject(error) : resolve()));
            });
        },
    };
}
