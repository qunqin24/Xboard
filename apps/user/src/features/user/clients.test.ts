import type { SubscriptionLinks } from "@xboard/contracts";
import { describe, expect, it } from "vitest";
import {
    CLIENTS,
    clientsFor,
    detectPlatform,
    PLATFORMS,
    recommendedClient,
} from "./clients";

const url = "https://panel.example.com/api/subscription/abc?x=1";
const links: SubscriptionLinks = {
    url,
    mihomo: `${url}&format=mihomo`,
    singbox: `${url}&format=singbox`,
    imports: {
        quantumultx: "quantumult-x:///add-resource?remote-resource=%7B%7D",
        loon: "loon://import?sub=https%3A%2F%2Fpanel.example.com",
        shadowrocketRules:
            "shadowrocket://config/add/https://panel.example.com",
    },
};

describe("detectPlatform", () => {
    it("recognises each platform", () => {
        expect(
            detectPlatform(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
            ),
        ).toBe("ios");
        expect(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe(
            "android",
        );
        expect(
            detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
        ).toBe("mac");
        expect(
            detectPlatform(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                5,
            ),
        ).toBe("ios");
        expect(
            detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
        ).toBe("windows");
        expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    });
});

describe("client catalogue", () => {
    it("recommends a client that runs on each platform", () => {
        for (const { value } of PLATFORMS) {
            expect(recommendedClient(value).platforms).toContain(value);
            expect(clientsFor(value).length).toBeGreaterThan(1);
        }
    });

    it("passes the subscription to every app's import link", () => {
        for (const client of CLIENTS) {
            const link = client.importUrl(links, "机场");
            expect(
                link.includes(url) ||
                    link.includes(encodeURIComponent(url)) ||
                    link.includes(btoa(url)) ||
                    Object.values(links.imports).includes(link),
            ).toBe(true);
            expect(link).toMatch(/^[a-z-]+:\/\//);
        }
    });

    it("adds Shadowrocket, Quantumult X and Loon on iOS and macOS", () => {
        const rocket = CLIENTS.find((client) => client.id === "shadowrocket")!;
        expect(rocket.core).toBe("分享链接");
        expect(rocket.importUrl(links, "我的机场")).toBe(
            `shadowrocket://add/sub://${btoa(url)}?remark=${encodeURIComponent("我的机场")}`,
        );
        // Shadowrocket takes its rules as a second import.
        expect(rocket.rulesUrl?.(links)).toBe(links.imports.shadowrocketRules);
        const qx = CLIENTS.find((client) => client.id === "quantumultx")!;
        expect(qx.importUrl(links, "x")).toBe(links.imports.quantumultx);
        expect(qx.core).toBe("节点列表");
        const loon = CLIENTS.find((client) => client.id === "loon")!;
        expect(loon.importUrl(links, "x")).toBe(links.imports.loon);
        expect(loon.core).toBe("配置文件");
        for (const client of [rocket, qx, loon]) {
            expect(clientsFor("ios")).toContain(client);
            expect(clientsFor("mac")).toContain(client);
            expect(clientsFor("android")).not.toContain(client);
            expect(clientsFor("windows")).not.toContain(client);
        }
        // The free Hiddify stays the iOS suggestion.
        expect(recommendedClient("ios").id).toBe("hiddify");
    });
});

it("pins the profile format in Surge and Surfboard import links", () => {
    for (const id of ["surge", "surfboard"]) {
        const client = CLIENTS.find((entry) => entry.id === id)!;
        const link = new URL(client.importUrl(links, "Xboard"));
        expect(link.protocol).toBe(`${id}:`);
        expect(link.pathname).toBe("/install-config");
        expect(
            new URL(link.searchParams.get("url")!).searchParams.get("format"),
        ).toBe(id);
    }
});
