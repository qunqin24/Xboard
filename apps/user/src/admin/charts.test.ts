import { describe, expect, it } from "vitest";
import { niceMax, percentChange, ticks } from "./charts";

describe("chart scales", () => {
    it("rounds axis maxima up to readable steps", () => {
        expect(niceMax(0)).toBe(1);
        expect(niceMax(7)).toBe(10);
        expect(niceMax(1990)).toBe(2000);
        expect(niceMax(2100)).toBe(2500);
        expect(niceMax(0.3)).toBeCloseTo(0.5);
        expect(niceMax(100)).toBe(100);
    });
    it("spreads ticks evenly from zero", () => {
        expect(ticks(100)).toEqual([0, 25, 50, 75, 100]);
    });
    it("reports change only when there is a baseline", () => {
        expect(percentChange(150, 100)).toBe(50);
        expect(percentChange(0, 0)).toBe(0);
        expect(percentChange(5, 0)).toBeNull();
    });
});
