import { z } from "zod";
import { endpoints, errorSchema, opsEndpoints } from "./endpoints";
import {
    OPS_API_PREFIX,
    OPS_IDEMPOTENCY_RETENTION_DAYS,
    OPS_REQUESTS_PER_MINUTE,
    opsIdempotencyKey,
} from "./ops";

const ERRORS: Record<number, string> = {
    400: "参数错误",
    401: "未通过身份验证",
    403: "无权限或来源不受信任",
    404: "不存在",
    409: "冲突",
    413: "请求体过大",
    415: "不支持的请求编码",
    429: "请求过于频繁",
    500: "服务暂时不可用",
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
    return buildDocument(false);
}

/** OpenAPI for the Bearer-authenticated administration endpoints. */
export function buildOpsOpenApi() {
    return buildDocument(true);
}

function buildDocument(ops: boolean) {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const endpoint of ops ? opsEndpoints : endpoints) {
        const path = endpoint.path.replace(/:(\w+)/g, "{$1}");
        const params: object[] = [...endpoint.path.matchAll(/:(\w+)/g)].map(
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
                    schema: value,
                });
        }
        const write = endpoint.method !== "get";
        if (ops && write)
            params.push({
                name: "Idempotency-Key",
                in: "header",
                required: true,
                description: `同一令牌下每次写操作的 UUID。${OPS_IDEMPOTENCY_RETENTION_DAYS} 天内重试时保持请求内容及此键相同。`,
                schema: schema(opsIdempotencyKey, "input"),
            });
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
        for (const code of ops
            ? [400, 401, 403, 404, 409, 413, 415, 429, 500]
            : endpoint.auth === "none"
              ? [400, 401, 403, 409, 429]
              : [400, 401, 403, 404, 409, 429])
            responses[code] = {
                description:
                    ops && code === 429
                        ? `来源 IP 或令牌超出每分钟 ${OPS_REQUESTS_PER_MINUTE} 次的请求上限`
                        : ERRORS[code],
                content: errorContent,
                ...(ops &&
                    code === 429 && {
                        headers: {
                            "Retry-After": {
                                description: "再次请求前应等待的秒数",
                                schema: { type: "integer" },
                            },
                        },
                    }),
            };
        paths[path] ??= {};
        paths[path][endpoint.method] = {
            tags: [endpoint.tag],
            summary: endpoint.summary,
            ...(ops
                ? {
                      security: [{ opsBearer: [] }],
                      "x-required-scope": write ? "admin:write" : "admin:read",
                  }
                : endpoint.auth === "none"
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
            title: ops ? "Xboard 运维 API" : "Xboard API",
            version: ops ? "1.0.0" : "0.2.0",
            description: ops
                ? "通过 Authorization: Bearer 请求头认证。令牌权限为 * 或各接口标明的范围。"
                : "写请求需带与 APP_ORIGIN 一致的 Origin 头；登录后会话保存在 HttpOnly Cookie xboard_session 中。",
        },
        servers: [{ url: ops ? OPS_API_PREFIX : "/api" }],
        components: {
            securitySchemes: ops
                ? {
                      opsBearer: { type: "http", scheme: "bearer" },
                  }
                : {
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
