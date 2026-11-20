import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createApp, type App } from "../src/app";

const ORIGIN = "http://127.0.0.1:5173";
const INDEX = "<!doctype html><title>Xboard</title>";

async function serve(webDirectory: string | undefined) {
    process.env.NODE_ENV = "test";
    process.env.APP_ORIGIN = ORIGIN;
    if (webDirectory) process.env.APP_WEB_DIR = webDirectory;
    else delete process.env.APP_WEB_DIR;
    const app = createApp({ logging: false });
    await app.listen(0, "127.0.0.1");
    return app;
}

describe("single-container web app", () => {
    let root: string;
    let app: App;
    let url: string;

    before(async () => {
        root = await mkdtemp(join(tmpdir(), "xboard-web-"));
        await mkdir(join(root, "assets"));
        await writeFile(join(root, "index.html"), INDEX);
        await writeFile(join(root, "favicon.svg"), "<svg/>");
        await writeFile(join(root, "assets", "index-abc123.js"), "1");
        app = await serve(root);
        url = app.getUrl();
    });

    after(async () => {
        await app.close();
        delete process.env.APP_WEB_DIR;
        await rm(root, { recursive: true, force: true });
    });

    it("serves index.html for the root and client-side routes", async () => {
        for (const path of ["/", "/admin/users", "/orders/42?x=1"]) {
            const response = await fetch(url + path);
            assert.equal(response.status, 200, path);
            assert.equal(await response.text(), INDEX);
            assert.match(response.headers.get("content-type")!, /text\/html/);
            assert.equal(response.headers.get("cache-control"), "no-cache");
        }
    });

    it("caches hashed assets and revalidates other files", async () => {
        const asset = await fetch(`${url}/assets/index-abc123.js`);
        assert.equal(asset.status, 200);
        assert.equal(
            asset.headers.get("cache-control"),
            "public, max-age=31536000, immutable",
        );
        const icon = await fetch(`${url}/favicon.svg`);
        assert.equal(icon.status, 200);
        assert.equal(icon.headers.get("cache-control"), "no-cache");
    });

    it("answers 404 for missing assets, unknown API paths and non-GET methods", async () => {
        const asset = await fetch(`${url}/assets/index-gone.js`);
        assert.equal(asset.status, 404);
        assert.match(asset.headers.get("content-type")!, /json/);

        const api = await fetch(`${url}/api/no-such-endpoint`);
        assert.equal(api.status, 404);
        assert.equal(api.headers.get("cache-control"), "no-store");
        assert.match(api.headers.get("content-type")!, /json/);

        const write = await fetch(`${url}/admin/users`, {
            method: "POST",
            headers: { origin: ORIGIN },
        });
        assert.equal(write.status, 404);
    });

    it("sends the security headers on pages and API responses", async () => {
        for (const path of ["/", "/api/no-such-endpoint"]) {
            const headers = (await fetch(url + path)).headers;
            const policy = headers.get("content-security-policy")!;
            assert.match(policy, /default-src 'none'/, path);
            assert.match(
                policy,
                /script-src 'self' https:\/\/challenges\.cloudflare\.com/,
            );
            assert.match(policy, /img-src 'self' data: https:/);
            assert.match(policy, /frame-ancestors 'none'/);
            assert.doesNotMatch(policy, /upgrade-insecure-requests/);
            assert.equal(
                headers.get("strict-transport-security"),
                "max-age=31536000",
            );
            assert.equal(headers.get("x-frame-options"), "DENY");
            assert.equal(headers.get("x-content-type-options"), "nosniff");
            assert.equal(headers.get("referrer-policy"), "no-referrer");
            assert.equal(
                headers.get("permissions-policy"),
                "camera=(), microphone=(), geolocation=()",
            );
        }
    });
});

describe("API-only mode", () => {
    it("does not serve pages when APP_WEB_DIR is unset", async () => {
        const app = await serve(undefined);
        try {
            const response = await fetch(`${app.getUrl()}/`);
            assert.equal(response.status, 404);
            assert.match(response.headers.get("content-type")!, /json/);
        } finally {
            await app.close();
        }
    });

    it("refuses to start with a web directory that has no index.html", async () => {
        const empty = await mkdtemp(join(tmpdir(), "xboard-web-empty-"));
        try {
            process.env.APP_WEB_DIR = empty;
            assert.throws(
                () => createApp({ logging: false }),
                /no index\.html/,
            );
        } finally {
            delete process.env.APP_WEB_DIR;
            await rm(empty, { recursive: true, force: true });
        }
    });
});
