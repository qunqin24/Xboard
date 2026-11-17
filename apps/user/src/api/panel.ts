import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@xboard/api-client";

export async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
): Promise<T> {
    const response = await fetch(`/api${path}`, {
        method,
        credentials: "same-origin",
        headers:
            body === undefined
                ? undefined
                : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
        const message = result?.error?.message;
        throw new ApiError(
            response.status,
            typeof message === "string"
                ? message
                : Array.isArray(message)
                  ? message.join("；")
                  : "请求失败，请稍后重试。",
        );
    }
    return result as T;
}
export function usePanel<T>(path: string, options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ["panel", path],
        queryFn: () => request<T>(path),
        retry: false,
        enabled: options.enabled,
    });
}
export function useCommand() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({
            path,
            method,
            body,
        }: {
            path: string;
            method?: string;
            body?: unknown;
        }) => request<Record<string, unknown>>(path, method ?? "POST", body),
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ["panel"] }),
                client.invalidateQueries({ queryKey: ["account"] }),
                client.invalidateQueries({ queryKey: ["plans"] }),
                client.invalidateQueries({ queryKey: ["orders"] }),
                client.invalidateQueries({ queryKey: ["site"] }),
            ]);
        },
    });
}

export type Site = {
    siteName: string;
    registrationOpen: boolean;
    supportNote: string;
};

const SITE_DEFAULTS: Site = {
    siteName: "Xboard",
    registrationOpen: true,
    supportNote: "",
};

/** Public site settings; falls back to defaults so sign-in never blocks on it. */
export function useSite() {
    return useQuery({
        queryKey: ["site"],
        queryFn: async () => {
            try {
                return {
                    ...SITE_DEFAULTS,
                    ...(await request<Partial<Site>>("/site")),
                };
            } catch {
                return SITE_DEFAULTS;
            }
        },
        staleTime: 5 * 60_000,
    });
}
