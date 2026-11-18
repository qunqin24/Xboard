import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "./client";
import { invalidateAfterWrite } from "./invalidate";
import { applyOptimistic, type SaveState } from "./optimistic";

type Change<T> = {
    id: T extends { id: infer I } ? I : never;
    /** What the row looks like once the change is saved. */
    fields: Partial<T>;
    path: string;
    method?: string;
    body?: unknown;
};

const SAVED_SHOWN_MS = 2000;

/**
 * Optimistic changes to the rows of a cached list (`usePanel(listPath)`):
 * the row changes everywhere at once, the save runs in the background, and
 * `status(id)` says "saving", "saved" (for 2 s) or "failed" (until `retry`).
 * A failed change is rolled back; the page shows the failure at the row.
 */
export function useOptimisticRows<T extends { id: number | string }>(
    listPath: string,
) {
    const client = useQueryClient();
    const queryKey = ["panel", listPath] as const;
    const [states, setStates] = useState<Record<string, SaveState>>({});
    const failed = useRef(new Map<string, Change<T>>());
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
    useEffect(() => {
        const pending = timers.current;
        return () => pending.forEach(clearTimeout);
    }, []);
    const set = (id: T["id"], state: SaveState | undefined) =>
        setStates((current) => {
            const next = { ...current };
            if (state) next[String(id)] = state;
            else delete next[String(id)];
            return next;
        });

    const mutation = useMutation({
        // The row reports its own failure; no toast.
        meta: { silentError: true },
        mutationFn: ({ path, method, body }: Change<T>) =>
            request(path, method ?? "PUT", body),
        onMutate: async (change) => {
            await client.cancelQueries({ queryKey });
            failed.current.delete(String(change.id));
            set(change.id, "saving");
            return applyOptimistic<T>(
                client,
                queryKey,
                change.id as T["id"],
                change.fields,
            );
        },
        onError: (_error, change, context) => {
            context?.rollback();
            failed.current.set(String(change.id), change);
            set(change.id as T["id"], "failed");
        },
        onSuccess: (_result, change) => {
            set(change.id as T["id"], "saved");
            const timer = setTimeout(() => {
                timers.current.delete(timer);
                setStates((current) =>
                    current[String(change.id)] === "saved"
                        ? Object.fromEntries(
                              Object.entries(current).filter(
                                  ([key]) => key !== String(change.id),
                              ),
                          )
                        : current,
                );
            }, SAVED_SHOWN_MS);
            timers.current.add(timer);
            invalidateAfterWrite(client, change.path);
        },
    });

    return {
        change: (change: Change<T>) => mutation.mutate(change),
        status: (id: T["id"]): SaveState | undefined => states[String(id)],
        retry: useCallback(
            (id: T["id"]) => {
                const change = failed.current.get(String(id));
                if (change) mutation.mutate(change);
            },
            [mutation],
        ),
    };
}
