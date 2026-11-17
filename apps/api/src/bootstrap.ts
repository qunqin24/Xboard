import "reflect-metadata";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
    FastifyAdapter,
    NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ApiErrorFilter } from "./common/api-error.filter";
import { getConfig } from "./config";

export async function createApp(
    options: { logging?: boolean; connect?: boolean } = {},
) {
    const config = getConfig();
    const allowedOrigins = new Set([config.origin]);
    if (config.environment === "development") {
        const localOrigin = new URL(config.origin);
        if (
            ["localhost", "127.0.0.1", "[::1]"].includes(localOrigin.hostname)
        ) {
            for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
                localOrigin.hostname = hostname;
                allowedOrigins.add(localOrigin.origin);
            }
        }
    }
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({
            bodyLimit: 1024 * 1024,
            trustProxy: process.env.TRUSTED_PROXY ?? false,
        }),
        {
            logger:
                options.logging === false ? false : ["log", "warn", "error"],
        },
    );
    await app.register(cookie);
    await app.register(helmet);
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            forbidUnknownValues: true,
        }),
    );
    app.useGlobalFilters(new ApiErrorFilter());
    app.getHttpAdapter()
        .getInstance()
        .addHook("onRequest", async (request, reply) => {
            reply.header("Cache-Control", "no-store");
            if (
                ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
                !/^\/api\/v1\/server\/UniProxy\/(push|alive|status)(\?|$)/.test(
                    request.url,
                ) &&
                !/^\/api\/v1\/server\/(Deepbwork|TrojanTidalab|ShadowsocksTidalab)\/submit(\?|$)/.test(
                    request.url,
                ) &&
                (!allowedOrigins.has(request.headers.origin ?? "") ||
                    request.headers["sec-fetch-site"] === "cross-site")
            ) {
                return reply.code(403).send({
                    error: {
                        status: 403,
                        message: "请求来源不受信任，请从用户端操作。",
                    },
                });
            }
        });
    const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
            .setTitle("Xboard TypeScript API")
            .setDescription("Xboard account and subscription management API.")
            .setVersion("0.1.0")
            .addCookieAuth("xboard_session")
            .build(),
    );
    // Swagger UI needs static assets; skip it when only generating the contract.
    if (options.connect !== false) {
        if (!config.production) SwaggerModule.setup("api/docs", app, document);
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    }
    return { app, document };
}
