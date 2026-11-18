import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, queryString, request } from "./client";

function respond(status: number, body?: unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            body === undefined
                ? new Response(null, { status })
                : new Response(JSON.stringify(body), {
                      status,
                      headers: { "content-type": "application/json" },
                  }),
        ),
    );
}

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
    it("sends JSON to /api and returns the parsed body", async () => {
        respond(200, { email: "a@example.test" });
        await expect(
            request("/auth/login", "POST", { email: "a@example.test" }),
        ).resolves.toEqual({ email: "a@example.test" });
        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(url).toBe("/api/auth/login");
        expect(init).toMatchObject({
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: '{"email":"a@example.test"}',
        });
    });

    it("treats 204 as success without a body", async () => {
        respond(204);
        await expect(request("/auth/logout", "POST")).resolves.toBeUndefined();
    });

    it("raises the server's message with its status", async () => {
        respond(409, { error: { status: 409, message: "仍有有效订阅" } });
        const error = await request("/admin/plans/1", "DELETE").catch(
            (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 409, message: "仍有有效订阅" });
    });

    it("falls back when the error body is not JSON", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("<html>", { status: 429 })),
        );
        await expect(request("/plans")).rejects.toMatchObject({
            status: 429,
            message: "请求过于频繁，请稍后再试。",
        });
    });
});

describe("queryString", () => {
    it("drops empty values and encodes the rest", () => {
        expect(
            queryString({ q: "a b", page: 2, status: undefined, role: "" }),
        ).toBe("?q=a+b&page=2");
        expect(queryString({ q: "" })).toBe("");
    });
});
