import createClient from "openapi-fetch";
import type { paths, components } from "./schema";

// Same-origin Vite proxy in development; no tokens in browser storage.
export const api = createClient<paths>({
    baseUrl: "",
    credentials: "same-origin",
});
export type Account = components["schemas"]["AccountDto"];
export type Plan = components["schemas"]["PlanDto"];
export type Order = components["schemas"]["OrderDto"];

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export function requireData<T>(result: {
    data?: T;
    error?: unknown;
    response: Response;
}): T {
    if (result.response.ok && result.data !== undefined) return result.data;
    const fallback =
        result.response.status === 429
            ? "请求过于频繁，请稍后再试。"
            : result.response.status === 401
              ? "邮箱或密码不正确，或登录已失效。"
              : "请求失败，请稍后重试。";
    const error = result.error as { error?: { message?: unknown } } | undefined;
    const message = error?.error?.message;
    throw new ApiError(
        result.response.status,
        result.response.status < 500 && typeof message === "string"
            ? message
            : fallback,
    );
}
