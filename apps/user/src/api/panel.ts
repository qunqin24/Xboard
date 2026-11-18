import {
    keepPreviousData,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import type { Site } from "@xboard/contracts";
import { request } from "./client";
import { useHeldPending } from "./held-pending";
import { invalidateAfterWrite } from "./invalidate";

export { request };
export function usePanel<T>(
    path: string,
    options: {
        enabled?: boolean;
        /** Keep showing the previous result while the next page or search loads. */
        keepPrevious?: boolean;
        /** Poll while this returns a number of ms; `false` stops. */
        refetchInterval?: (data: T | undefined) => number | false;
    } = {},
) {
    return useHeldPending(
        useQuery({
            queryKey: ["panel", path],
            queryFn: () => request<T>(path),
            retry: false,
            enabled: options.enabled,
            refetchInterval: options.refetchInterval
                ? (query) => options.refetchInterval!(query.state.data)
                : undefined,
            placeholderData: options.keepPrevious
                ? keepPreviousData
                : undefined,
        }),
    );
}
/**
 * A write. After it succeeds, everything cached is marked stale (so any page
 * opened later fetches fresh data), but only the active queries of the same
 * resource, plus the account, are fetched again now, and the call does not
 * wait for them: the button is released as soon as the write is done.
 *
 * `related` adds path prefixes to refresh at once, e.g. `["/admin/plans"]`.
 * `inline: true` means the caller shows `error` next to the form itself, so the
 * global failure toast is skipped.
 */
export function useCommand<T = Record<string, unknown>>(
    options: { inline?: boolean } = {},
) {
    const client = useQueryClient();
    return useMutation({
        meta: options.inline ? { silentError: true } : undefined,
        mutationFn: ({
            path,
            method,
            body,
        }: {
            path: string;
            method?: string;
            body?: unknown;
            related?: string[];
        }) => request<T>(path, method ?? "POST", body),
        onSuccess: (_result, { path, related }) =>
            invalidateAfterWrite(client, path, related),
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
