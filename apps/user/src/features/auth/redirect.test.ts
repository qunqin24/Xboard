import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
    it("keeps same-origin paths with their query", () => {
        expect(safeRedirect("/admin/users?user=2")).toBe("/admin/users?user=2");
    });
    it("rejects other origins and protocol-relative URLs", () => {
        expect(safeRedirect("https://evil.example/x")).toBe("/");
        expect(safeRedirect("//evil.example/x")).toBe("/");
        expect(safeRedirect("javascript:alert(1)")).toBe("/");
    });
    it("avoids looping back to auth pages", () => {
        expect(safeRedirect("/sign-in")).toBe("/");
        expect(safeRedirect(undefined)).toBe("/");
    });
});
