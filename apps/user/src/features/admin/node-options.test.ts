import { describe, expect, it } from "vitest";
import { nodeBody, REALITY_KEY, SHORT_ID } from "@xboard/contracts";
import {
    formatJsonField,
    generateRealityKeys,
    nodeSummary,
    parseJsonField,
    randomShortId,
    splitTags,
    toFormValues,
} from "./node-options";
import type { NodeRow } from "./types";

describe("node form helpers", () => {
    it("starts a new node with values the API accepts", () => {
        const values = toFormValues(null);
        const parsed = nodeBody.safeParse({
            ...values,
            name: "n",
            host: "a.example.com",
        });
        expect(parsed.success).toBe(true);
    });

    it("splits tags on Chinese and ASCII separators without duplicates", () => {
        expect(splitTags("香港, IPLC，日本、香港\n")).toEqual([
            "香港",
            "IPLC",
            "日本",
        ]);
    });

    it("keeps invalid JSON as text so validation can report it", () => {
        expect(parseJsonField("")).toEqual([]);
        expect(parseJsonField('[{"tag":"a"}]')).toEqual([{ tag: "a" }]);
        expect(parseJsonField("[{")).toBe("[{");
        expect(formatJsonField([])).toBe("");
        expect(formatJsonField("[{")).toBe("[{");
    });

    it("generates Reality keys and short ids in Xray's format", async () => {
        const keys = await generateRealityKeys();
        expect(keys.privateKey).toMatch(REALITY_KEY);
        expect(keys.publicKey).toMatch(REALITY_KEY);
        expect(keys.privateKey).not.toBe(keys.publicKey);
        expect(randomShortId()).toMatch(SHORT_ID);
        expect(randomShortId()).toHaveLength(16);
    });

    it("summarises security and transport", () => {
        const row = {
            protocol: "vless",
            settings: {
                security: "reality",
                flow: "xtls-rprx-vision",
                transport: { network: "tcp" },
            },
        } as unknown as NodeRow;
        expect(nodeSummary(row)).toBe("Reality · TCP · Vision");
        expect(
            nodeSummary({
                protocol: "shadowsocks",
                settings: { cipher: "aes-128-gcm", plugin: "obfs" },
            } as unknown as NodeRow),
        ).toBe("aes-128-gcm · obfs");
    });
});
