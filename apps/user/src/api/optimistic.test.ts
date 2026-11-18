import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyOptimistic } from "./optimistic";

type Item = { id: number; enabled: boolean; name: string };
const key = ["panel", "/admin/nodes"] as const;

function setup() {
    const client = new QueryClient();
    client.setQueryData<Item[]>(key, [
        { id: 1, enabled: false, name: "a" },
        { id: 2, enabled: false, name: "b" },
    ]);
    return client;
}

describe("applyOptimistic", () => {
    it("shows the change at once and rolls back to the old value", () => {
        const client = setup();
        const change = applyOptimistic<Item>(client, key, 1, { enabled: true });
        expect(client.getQueryData<Item[]>(key)?.[0]?.enabled).toBe(true);
        change?.rollback();
        expect(client.getQueryData<Item[]>(key)?.[0]).toEqual({
            id: 1,
            enabled: false,
            name: "a",
        });
    });

    it("rolls back one row without undoing another row's change", () => {
        const client = setup();
        const first = applyOptimistic<Item>(client, key, 1, { enabled: true });
        applyOptimistic<Item>(client, key, 2, { enabled: true });
        first?.rollback();
        const list = client.getQueryData<Item[]>(key);
        expect(list?.map((item) => item.enabled)).toEqual([false, true]);
    });

    it("does nothing for a row that is not cached", () => {
        const client = setup();
        expect(
            applyOptimistic<Item>(client, key, 9, { enabled: true }),
        ).toBeNull();
        expect(
            client.getQueryData<Item[]>(["panel", "/other"]),
        ).toBeUndefined();
    });
});
