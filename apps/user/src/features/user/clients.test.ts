import { describe, expect, it } from "vitest";
import {
    CLIENTS,
    clientsFor,
    detectPlatform,
    PLATFORMS,
    recommendedClient,
} from "./clients";

const url = "https://panel.example.com/api/subscription/abc?x=1";

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

    it("passes the subscription URL to every app's import link", () => {
        for (const client of CLIENTS) {
            const link = client.importUrl(url, "机场");
            expect(
                link.includes(url) ||
                    link.includes(encodeURIComponent(url)) ||
                    link.includes(btoa(url)),
            ).toBe(true);
            expect(link).toMatch(/^[a-z-]+:\/\//);
        }
    });

    it("adds Shadowrocket, Quantumult X and Loon on iOS and macOS", () => {
        const rocket = CLIENTS.find((client) => client.id === "shadowrocket")!;
        expect(rocket.core).toBe("分享链接");
        expect(clientsFor("ios")).toContain(rocket);
        expect(clientsFor("mac")).toContain(rocket);
        expect(clientsFor("android")).not.toContain(rocket);
        expect(rocket.importUrl(url, "我的机场")).toBe(
            `shadowrocket://add/sub://${btoa(url)}?remark=${encodeURIComponent("我的机场")}`,
        );
        const qx = CLIENTS.find((client) => client.id === "quantumultx")!;
        const resource = new URL(
            qx.importUrl(url, "我的机场"),
        ).searchParams.get("remote-resource");
        expect(qx.importUrl(url, "x")).toMatch(
            /^quantumult-x:\/\/\/add-resource\?remote-resource=/,
        );
        expect(JSON.parse(resource!)).toEqual({
            server_remote: [`${url}, tag=我的机场`],
        });
        const loon = CLIENTS.find((client) => client.id === "loon")!;
        expect(loon.importUrl(url, "x")).toBe(
            `loon://import?nodelist=${encodeURIComponent(url)}`,
        );
        for (const client of [qx, loon]) {
            expect(client.core).toBe("节点列表");
            expect(clientsFor("ios")).toContain(client);
            expect(clientsFor("mac")).toContain(client);
            expect(clientsFor("windows")).not.toContain(client);
        }
        // The free Hiddify stays the iOS suggestion.
        expect(recommendedClient("ios").id).toBe("hiddify");
    });
});
