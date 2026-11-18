import { useDelayedFlag } from "@/hooks/use-delayed-flag";

/**
 * A query result whose `isPending` stays true until a skeleton that has been
 * shown has been on screen for its minimum time (300 ms delay, 500 ms minimum,
 * see `lib/delayed-flag.ts`). Once data arrives the data is already in the
 * result; only the skeleton is held, so call sites need no timing code.
 * `isPending` is never false while the data is missing, so type narrowing on
 * `isPending` still holds.
 */
export function useHeldPending<T extends { isPending: boolean }>(query: T): T {
    const skeletonShown = useDelayedFlag(query.isPending);
    return skeletonShown && !query.isPending
        ? { ...query, isPending: true }
        : query;
}
