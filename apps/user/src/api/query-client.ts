import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@xboard/api-client";

export function makeQueryClient() {
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
    });
}
