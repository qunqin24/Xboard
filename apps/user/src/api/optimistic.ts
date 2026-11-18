import type { QueryClient } from "@tanstack/react-query";

type Row = { id: number | string };

/**
 * Show the result of a change at once by editing one row of a cached list.
 * Returns `rollback`, which puts back only the fields this change touched, so
 * two changes in flight on different rows (or fields) never undo each other.
 * Returns null when the row is not in the cache; nothing is shown then.
 */
export function applyOptimistic<T extends Row>(
    client: QueryClient,
    queryKey: readonly unknown[],
    id: T["id"],
    fields: Partial<T>,
): { rollback: () => void } | null {
    const list = client.getQueryData<T[]>(queryKey);
    const row = list?.find((item) => item.id === id);
    if (!list || !row) return null;
    const previous = Object.fromEntries(
        Object.keys(fields).map((key) => [key, row[key as keyof T]]),
    ) as Partial<T>;
    const patch = (values: Partial<T>) => (current: T[] | undefined) =>
        current?.map((item) =>
            item.id === id ? { ...item, ...values } : item,
        );
    client.setQueryData<T[]>(queryKey, patch(fields));
    return {
        rollback: () => client.setQueryData<T[]>(queryKey, patch(previous)),
    };
}

export type SaveState = "saving" | "saved" | "failed";
