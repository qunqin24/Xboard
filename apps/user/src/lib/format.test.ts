import { describe, expect, it } from "vitest";
import {
    daysLeft,
    formatDate,
    formatMinor,
    formatTraffic,
    sumBytes,
    toGiB,
    usedPercent,
} from "./format";

describe("traffic formatting", () => {
    it("converts decimal byte strings with a 1024 base", () => {
        expect(toGiB("137438953472")).toBeCloseTo(128);
        expect(formatTraffic("137438953472")).toBe("128 GB");
        expect(formatTraffic("0")).toBe("0 GB");
    });

    it("keeps one decimal below 100 GB", () => {
        expect(formatTraffic("4294967296")).toBe("4.0 GB");
    });

    it("rejects non numeric input instead of showing NaN", () => {
        expect(() => toGiB("abc")).toThrow();
        expect(() => toGiB("-1")).toThrow();
    });

    it("clamps usage between 0 and 100 percent", () => {
        expect(usedPercent("50", "100")).toBe(50);
        expect(usedPercent("200", "100")).toBe(100);
        expect(usedPercent("10", "0")).toBe(0);
    });

    it("sums byte strings without floating point loss", () => {
        expect(sumBytes("9007199254740993", "1")).toBe("9007199254740994");
    });
});

describe("money and dates", () => {
    it("renders minor units as yuan with two decimals", () => {
        expect(formatMinor(1990)).toBe("¥19.90");
        expect(formatMinor(0)).toBe("¥0.00");
    });

    it("formats expiry in Shanghai time and treats null as permanent", () => {
        expect(formatDate(null)).toBe("长期有效");
        expect(formatDate(Date.UTC(2026, 11, 1, 16, 0, 0) / 1000)).toBe(
            "2026/12/02",
        );
    });

    it("counts remaining days by calendar day boundary", () => {
        const now = Date.UTC(2026, 10, 16, 0, 0, 0);
        expect(daysLeft(now / 1000 + 86_400 * 3, now)).toBe(3);
        expect(daysLeft(null, now)).toBeNull();
    });
});
