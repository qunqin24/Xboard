import { currentLocale } from "@/i18n";
/** A failed API call; `message` is the server's Chinese error text. */
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly code?: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

function fallbackMessage(status: number): string {
    if (status === 429) return "请求过于频繁，请稍后再试。";
    if (status === 401) return "登录已失效，请重新登录。";
    return "请求失败，请稍后重试。";
}

/**
 * Call the API under /api with the session cookie. Response types come from
 * `@xboard/contracts`, e.g. `request<Account>("/account")`.
 */
export async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
): Promise<T> {
    const response = await fetch(`/api${path}`, {
        method,
        credentials: "same-origin",
        headers: {
            "X-Xboard-Locale": currentLocale(),
            ...(body === undefined
                ? {}
                : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
    const result = await response.json().catch(() => null);
    if (!response.ok) {
        const message = result?.error?.message;
        throw new ApiError(
            response.status,
            typeof message === "string"
                ? message
                : fallbackMessage(response.status),
            typeof result?.error?.code === "string"
                ? result.error.code
                : undefined,
        );
    }
    return result as T;
}

/** Query string from defined, non-empty values: `{ q: "a", page: 2 }` → "?q=a&page=2". */
export function queryString(
    params: Record<string, string | number | undefined>,
): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
        if (value !== undefined && value !== "") search.set(key, String(value));
    const text = search.toString();
    return text ? `?${text}` : "";
}
