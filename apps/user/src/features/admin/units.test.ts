import { describe, expect, it } from "vitest";
import {
    bytesToGiB,
    fromDateInput,
    giBToBytes,
    minorToYuan,
    nodeState,
    toDateInput,
    yuanToMinor,
} from "./units";

describe("admin form units", () => {
    it("round-trips GB and bytes", () => {
        expect(giBToBytes("128")).toBe("137438953472");
        expect(bytesToGiB("137438953472")).toBe("128");
        expect(bytesToGiB("1610612736")).toBe("1.5");
    });
    it("round-trips yuan and fen without float drift", () => {
        expect(yuanToMinor("19.90")).toBe(1990);
        expect(yuanToMinor("0.29")).toBe(29);
        expect(minorToYuan(1990)).toBe("19.90");
    });
    it("uses the end of the Shanghai day for expiry dates", () => {
        const seconds = fromDateInput("2026-12-17")!;
        expect(new Date(seconds * 1000).toISOString()).toBe(
            "2026-12-17T15:59:59.000Z",
        );
        expect(toDateInput(seconds)).toBe("2026-12-17");
        expect(fromDateInput("")).toBeNull();
        expect(toDateInput(null)).toBe("");
    });
    it("classifies node liveness", () => {
        const now = Date.parse("2026-11-18T00:00:00Z");
        expect(nodeState({ enabled: false, lastSeenAt: null }, now)).toBe(
            "已停用",
        );
        expect(nodeState({ enabled: true, lastSeenAt: null }, now)).toBe(
            "未连接",
        );
        expect(
            nodeState(
                { enabled: true, lastSeenAt: "2026-11-17T23:58:00Z" },
                now,
            ),
        ).toBe("在线");
        expect(
            nodeState(
                { enabled: true, lastSeenAt: "2026-11-17T23:50:00Z" },
                now,
            ),
        ).toBe("离线");
    });
});
