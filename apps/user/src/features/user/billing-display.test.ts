import { describe, expect, it } from "vitest";
import { formatSettlement, periodLabel } from "@/lib/format";

describe("billing display", () => {
    it("labels refunds and shows the absolute amount in yuan", () => {
        expect(formatSettlement(-1234)).toBe("退回 ¥12.34");
        expect(formatSettlement(600)).toBe("¥6.00");
        expect(formatSettlement(0)).toBe("¥0.00");
    });

    it("labels a traffic reset order without a payment period", () => {
        expect(periodLabel(null)).toBe("流量重置包");
        expect(periodLabel("yearly")).toBe("年付");
    });
});
