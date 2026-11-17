import { makeQueryClient } from "./api/query-client";

/** Set by main.tsx once the router exists. */
export const unauthorized = { handler: () => {} };

export const queryClient = makeQueryClient({
    onUnauthorized: () => unauthorized.handler(),
});
