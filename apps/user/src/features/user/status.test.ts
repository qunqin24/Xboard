import { describe, expect, it } from "vitest";
import { orderStatus, subscriptionStatus } from "./status";

const now = Date.parse("2026-11-18T00:00:00Z");

describe("orderStatus", () => {
    it("lets only live pending orders be paid", () => {
        expect(
            orderStatus("pending", "2026-11-18T00:10:00Z", now),
        ).toMatchObject({ label: "待支付", payable: true });
        expect(
            orderStatus("pending", "2026-11-17T23:59:00Z", now),
        ).toMatchObject({ label: "已超时", payable: false });
        expect(orderStatus("paid", "2026-11-17T00:00:00Z", now).label).toBe(
            "已开通",
        );
        expect(
            orderStatus("cancelled", "2026-11-19T00:00:00Z", now).payable,
        ).toBe(false);
    });
});

describe("subscriptionStatus", () => {
    const base = {
        plan: { id: 1, name: "轻量" },
        expiredAt: now / 1000 + 86400,
        uploadBytes: "0",
        downloadBytes: "0",
        transferBytes: "100",
    };
    it("reports missing, expired and exhausted subscriptions", () => {
        expect(
            subscriptionStatus({ ...base, plan: null } as never, now).label,
        ).toBe("未开通");
        expect(
            subscriptionStatus(
                { ...base, expiredAt: now / 1000 - 1 } as never,
                now,
            ).label,
        ).toBe("已到期");
        expect(
            subscriptionStatus({ ...base, downloadBytes: "100" } as never, now)
                .label,
        ).toBe("流量已用完");
        expect(
            subscriptionStatus({ ...base, downloadBytes: "95" } as never, now)
                .label,
        ).toBe("流量即将用完");
        expect(subscriptionStatus(base as never, now).label).toBe("正常使用中");
    });
    it("treats a null expiry as perpetual", () => {
        expect(
            subscriptionStatus({ ...base, expiredAt: null } as never, now)
                .label,
        ).toBe("正常使用中");
    });
});
