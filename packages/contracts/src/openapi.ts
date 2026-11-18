import { z } from "zod";
import { endpoints, errorSchema } from "./endpoints";

const ERRORS: Record<number, string> = {
    400: "参数错误",
    401: "未登录",
    403: "无权限或来源不受信任",
    404: "不存在",
    409: "冲突",
    429: "请求过于频繁",
};

function schema(type: z.ZodType, io: "input" | "output") {
    return z.toJSONSchema(type, {
        io,
        unrepresentable: "any",
        target: "openapi-3.0",
    });
}

/** The OpenAPI 3 document for /api, built from the zod contracts. */
export function buildOpenApi() {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const endpoint of endpoints) {
        const path = endpoint.path.replace(/:(\w+)/g, "{$1}");
        const params = [...endpoint.path.matchAll(/:(\w+)/g)].map(
            ([, name]) => ({
                name,
                in: "path",
                required: true,
                schema: { type: "string" },
            }),
        );
        if (endpoint.query) {
            const query = schema(endpoint.query, "input") as {
                properties?: Record<string, unknown>;
                required?: string[];
            };
            for (const [name, value] of Object.entries(query.properties ?? {}))
                params.push({
                    name,
                    in: "query",
                    required: query.required?.includes(name) ?? false,
                    schema: value as never,
                });
        }
        const status = endpoint.status ?? 200;
        const responses: Record<string, unknown> = {
            [status]: endpoint.response
                ? {
                      description: "成功",
                      content: {
                          "application/json": {
                              schema: schema(endpoint.response, "output"),
                          },
                      },
                  }
                : { description: "成功" },
        };
        const errorContent = {
            "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
            },
        };
        for (const code of endpoint.auth === "none"
            ? [400, 409, 429]
            : [400, 401, 403, 404, 409])
            responses[code] = {
                description: ERRORS[code],
                content: errorContent,
            };
        paths[path] ??= {};
        paths[path][endpoint.method] = {
            tags: [endpoint.tag],
            summary: endpoint.summary,
            ...(endpoint.auth === "none"
                ? {}
                : { security: [{ session: [] }] }),
            ...(params.length ? { parameters: params } : {}),
            ...(endpoint.body
                ? {
                      requestBody: {
                          required: true,
                          content: {
                              "application/json": {
                                  schema: schema(endpoint.body, "input"),
                              },
                          },
                      },
                  }
                : {}),
            responses,
        };
    }
    return {
        openapi: "3.0.3",
        info: {
            title: "Xboard API",
            version: "0.2.0",
            description:
                "写请求需带与 APP_ORIGIN 一致的 Origin 头；登录后会话保存在 HttpOnly Cookie xboard_session 中。",
        },
        servers: [{ url: "/api" }],
        components: {
            securitySchemes: {
                session: {
                    type: "apiKey",
                    in: "cookie",
                    name: "xboard_session",
                },
            },
            schemas: { Error: schema(errorSchema, "output") },
        },
        paths,
    };
}
