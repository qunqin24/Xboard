import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { versionSchema } from "@xboard/contracts";
import { isNewer, resetVersionCache } from "../src/modules/system/version";
import { startTestApp } from "./helpers";

const PASSWORD = "test-version-password";
const RELEASES = "https://api.github.com/repos/qunqin24/Xboard/releases/latest";

it("compares release versions", () => {
    assert.equal(isNewer("1.1.0", "1.0.9"), true);
    assert.equal(isNewer("1.0.0", "1.0.0"), false);
    assert.equal(isNewer("0.9.9", "1.0.0"), false);
    assert.equal(isNewer("1.0.10", "1.0.9"), true);
    assert.equal(isNewer("v2.0.0", "1.9.9"), true);
    assert.equal(isNewer("1.0.0", "1.0.0-rc.1"), true);
    assert.equal(isNewer("1.0.0", "edge"), null);
});

describe("version check", () => {
    let app: Awaited<ReturnType<typeof startTestApp>>;
    let admin: string;
    let user: string;
    const env = { ...process.env };
    const fetchReal = globalThis.fetch;
    let calls = 0;
    let reply: () => Response = () => new Response(null, { status: 500 });

    before(async () => {
        app = await startTestApp();
        await app.createUser("version-admin@example.test", PASSWORD, {
            role: "admin",
        });
        await app.createUser("version-user@example.test", PASSWORD);
        admin = await app.cookieFor("version-admin@example.test", PASSWORD);
        user = await app.cookieFor("version-user@example.test", PASSWORD);
        globalThis.fetch = async (input, init) => {
            if (String(input) !== RELEASES) return fetchReal(input, init);
            calls += 1;
            return reply();
        };
    });
    after(async () => {
        globalThis.fetch = fetchReal;
        process.env = env;
        await app?.stop();
    });
    beforeEach(() => {
        resetVersionCache();
        calls = 0;
        process.env.APP_VERSION = "1.0.0";
        process.env.APP_COMMIT = "0123456789abcdef";
        delete process.env.APP_UPDATE_REPO;
    });

    const read = async (query = "") => {
        const response = await app.call(`/admin/version${query}`, {
            cookie: admin,
        });
        assert.equal(response.status, 200, await response.clone().text());
        return versionSchema.parse(await response.json());
    };
    const release = (tag: string) => () =>
        Response.json({
            tag_name: tag,
            html_url: `https://github.com/qunqin24/Xboard/releases/tag/${tag}`,
            published_at: "2026-12-01T00:00:00Z",
        });

    it("reports a newer release and caches the answer", async () => {
        reply = release("v1.1.0");
        const info = await read();
        assert.equal(info.current, "1.0.0");
        assert.equal(info.commit, "0123456789ab");
        assert.equal(info.updateAvailable, true);
        assert.deepEqual(info.latest, {
            version: "1.1.0",
            url: "https://github.com/qunqin24/Xboard/releases/tag/v1.1.0",
            publishedAt: "2026-12-01T00:00:00Z",
        });
        await read();
        assert.equal(calls, 1);
        // An explicit check asks again.
        await read("?refresh=1");
        assert.equal(calls, 2);
    });

    it("says up to date on the latest release", async () => {
        reply = release("v1.0.0");
        const info = await read();
        assert.equal(info.updateAvailable, false);
    });

    it("cannot compare an edge build", async () => {
        process.env.APP_VERSION = "edge";
        reply = release("v1.0.0");
        const info = await read();
        assert.equal(info.current, "edge");
        assert.equal(info.updateAvailable, null);
        assert.equal(info.latest?.version, "1.0.0");
    });

    it("reports a failed check without guessing", async () => {
        reply = () => new Response("rate limited", { status: 403 });
        const info = await read();
        assert.equal(info.latest, null);
        assert.equal(info.updateAvailable, null);
        assert.match(info.error ?? "", /GitHub/);
    });

    it("never calls GitHub when the check is turned off", async () => {
        process.env.APP_UPDATE_REPO = "";
        reply = release("v9.9.9");
        const info = await read("?refresh=1");
        assert.equal(info.checkEnabled, false);
        assert.equal(info.latest, null);
        assert.equal(calls, 0);
    });

    it("is for administrators only", async () => {
        const response = await app.call("/admin/version", { cookie: user });
        assert.equal(response.status, 403);
    });
});
