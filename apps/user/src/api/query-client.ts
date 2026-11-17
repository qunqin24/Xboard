import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@xboard/api-client";
import { handleServerError } from "@/lib/handle-server-error";

declare module "@tanstack/react-query" {
    interface Register {
        mutationMeta: { silentError?: boolean };
    }
}

export function makeQueryClient(options: { onUnauthorized?: () => void } = {}) {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // Retry only transient failures; auth and validation errors are final.
                retry: (count, error) =>
                    !(error instanceof ApiError && error.status < 500) &&
                    count < 1,
                staleTime: 30_000,
                refetchOnWindowFocus: false,
            },
            mutations: { retry: false },
        },
        queryCache: new QueryCache({
            onError: (error) => {
                if (error instanceof ApiError && error.status === 401)
                    options.onUnauthorized?.();
            },
        }),
        // Every failed mutation surfaces its message as a toast, as upstream does,
        // unless it sets `meta: { silentError: true }` and reports the error itself.
        mutationCache: new MutationCache({
            onError: (error, _variables, _context, mutation) => {
                if (!mutation.meta?.silentError) handleServerError(error);
            },
        }),
    });
}
