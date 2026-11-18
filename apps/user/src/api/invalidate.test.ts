import { describe, expect, it } from "vitest";
import { relatedPrefix } from "./invalidate";

describe("relatedPrefix", () => {
    it("names the resource a write belongs to", () => {
        expect(relatedPrefix("/admin/nodes/3/enabled")).toBe("/admin/nodes");
        expect(relatedPrefix("/admin/nodes/bulk-enabled")).toBe("/admin/nodes");
        expect(relatedPrefix("/tickets/7/reply")).toBe("/tickets");
        expect(relatedPrefix("/account/totp/enable")).toBe("/account");
        expect(relatedPrefix("/admin/users?q=a")).toBe("/admin/users");
        expect(relatedPrefix("/")).toBe("/");
    });
});
