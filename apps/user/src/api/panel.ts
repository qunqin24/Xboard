import {
    keepPreviousData,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import type { Site } from "@xboard/contracts";
import { request } from "./client";

export { request };
export function usePanel<T>(
    path: string,
    options: {
        enabled?: boolean;
        /** Keep showing the previous result while the next page or search loads. */
        keepPrevious?: boolean;
    } = {},
) {
    return useQuery({
        queryKey: ["panel", path],
        queryFn: () => request<T>(path),
        retry: false,
        enabled: options.enabled,
        placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    });
}
export function useCommand<T = Record<string, unknown>>() {
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
        }) => request<T>(path, method ?? "POST", body),
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

export type { Site };

const SITE_DEFAULTS: Site = {
    siteName: "Xboard",
    registrationOpen: true,
    supportNote: "",
    inviteOnly: false,
    emailCodeRequired: false,
    termsUrl: "",
    privacyUrl: "",
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
