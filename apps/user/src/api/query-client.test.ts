import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { makeQueryClient } = await import("./query-client");

async function failMutation(error: unknown, meta?: { silentError?: boolean }) {
    const onUnauthorized = vi.fn();
    const client = makeQueryClient({ onUnauthorized });
    await client
        .getMutationCache()
        .build(client, {
            mutationFn: () => Promise.reject(error),
            meta,
        })
        .execute(undefined)
        .catch(() => undefined);
    return onUnauthorized;
}

describe("makeQueryClient", () => {
    it("sends an expired session back to sign-in when a mutation fails", async () => {
        const onUnauthorized = await failMutation(
            new ApiError(401, "登录已失效，请重新登录。"),
        );
        expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it("leaves sign-in's own 401 (wrong password) to the form", async () => {
        const onUnauthorized = await failMutation(
            new ApiError(401, "邮箱或密码不正确，或账户不可用。"),
            { silentError: true },
        );
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it("does not redirect on other errors", async () => {
        const onUnauthorized = await failMutation(
            new ApiError(400, "参数错误"),
        );
        expect(onUnauthorized).not.toHaveBeenCalled();
    });
});
