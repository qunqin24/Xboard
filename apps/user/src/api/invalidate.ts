import type { QueryClient } from "@tanstack/react-query";

/**
 * The resource a write belongs to, as a path prefix, so only the lists of that
 * resource are fetched again: `/admin/nodes/3/enabled` -> `/admin/nodes`,
 * `/tickets/7/reply` -> `/tickets`, `/account/totp/enable` -> `/account`.
 */
export function relatedPrefix(path: string): string {
    const [first, second] = (path.split("?")[0] ?? "")
        .split("/")
        .filter(Boolean);
    if (!first) return "/";
    return first === "admin" && second ? `/admin/${second}` : `/${first}`;
}

/**
 * After a write: mark every cached query stale (a page opened later fetches
 * fresh data), but fetch again now only the active queries of the same
 * resource and the account. Does not wait for the requests.
 */
export function invalidateAfterWrite(
    client: QueryClient,
    path: string,
    related: string[] = [],
) {
    const prefixes = [relatedPrefix(path), ...related];
    const refetchNow = (key: readonly unknown[]) =>
        key[0] === "account" ||
        (key[0] === "panel" &&
            typeof key[1] === "string" &&
            prefixes.some((prefix) => String(key[1]).startsWith(prefix)));
    void client.invalidateQueries({
        predicate: (query) => refetchNow(query.queryKey),
    });
    void client.invalidateQueries({
        predicate: (query) => !refetchNow(query.queryKey),
        refetchType: "none",
    });
}
