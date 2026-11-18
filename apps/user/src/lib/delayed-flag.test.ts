import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDelayedFlag } from "./delayed-flag";

describe("createDelayedFlag", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function setup() {
        const seen: boolean[] = [];
        const flag = createDelayedFlag((value) => seen.push(value), 300, 500);
        return { seen, flag };
    }

    it("never shows work that finishes within the delay", () => {
        const { seen, flag } = setup();
        flag.set(true);
        vi.advanceTimersByTime(299);
        flag.set(false);
        vi.advanceTimersByTime(2000);
        expect(seen).toEqual([]);
    });

    it("shows after the delay and stays at least the minimum time", () => {
        const { seen, flag } = setup();
        flag.set(true);
        vi.advanceTimersByTime(300);
        expect(seen).toEqual([true]);
        // Finishes 50 ms after it appeared: hidden only once 500 ms have passed.
        vi.advanceTimersByTime(50);
        flag.set(false);
        vi.advanceTimersByTime(449);
        expect(seen).toEqual([true]);
        vi.advanceTimersByTime(1);
        expect(seen).toEqual([true, false]);
    });

    it("hides at once when it has been visible longer than the minimum", () => {
        const { seen, flag } = setup();
        flag.set(true);
        vi.advanceTimersByTime(1500);
        flag.set(false);
        vi.advanceTimersByTime(0);
        expect(seen).toEqual([true, false]);
    });

    it("stays visible if work restarts while the minimum time runs out", () => {
        const { seen, flag } = setup();
        flag.set(true);
        vi.advanceTimersByTime(300);
        flag.set(false);
        vi.advanceTimersByTime(100);
        flag.set(true);
        vi.advanceTimersByTime(5000);
        expect(seen).toEqual([true]);
        flag.set(false);
        vi.advanceTimersByTime(0);
        expect(seen).toEqual([true, false]);
    });

    it("does nothing after dispose", () => {
        const { seen, flag } = setup();
        flag.set(true);
        flag.dispose();
        vi.advanceTimersByTime(1000);
        expect(seen).toEqual([]);
    });
});
