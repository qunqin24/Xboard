import { ApiError } from "@xboard/api-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { serverErrorMessage } = await import("./handle-server-error");

describe("serverErrorMessage", () => {
    it("shows the API's own message", () => {
        expect(serverErrorMessage(new ApiError(409, "仍有有效订阅"))).toBe(
            "仍有有效订阅",
        );
    });
    it("explains network failures", () => {
        expect(serverErrorMessage(new TypeError("Failed to fetch"))).toBe(
            "无法连接服务器，请检查网络后重试。",
        );
    });
    it("falls back for unknown values", () => {
        expect(serverErrorMessage(undefined)).toBe("操作失败，请稍后重试。");
    });
});
