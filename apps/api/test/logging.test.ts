import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { it } from "node:test";
import express from "express";
import { db } from "../src/db";
import { sealApplicationSecret } from "../src/modules/system/secrets";
import { startTestApp } from "./helpers";
import { errorHandler } from "../src/http/errors";
import {
    errorFields,
    refreshAlertWebhook,
    reportJobFailure,
    requestLogging,
    setAlertWebhookReader,
} from "../src/logging";

async function listen(server: Server) {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

it("retains stack frames while omitting arbitrary error messages", () => {
    const error = new Error(
        "A private token\n    at still part of the message",
    );
    const fields = errorFields(error);
    const serialized = JSON.stringify(fields);
    assert.match(serialized, /logging\.test\.ts/);
    assert.doesNotMatch(serialized, /private token|part of the message/);
});

it("correlates 5xx and failed job alerts without sending request credentials", async () => {
    const alerts: Record<string, unknown>[] = [];
    const webhook = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        alerts.push(JSON.parse(Buffer.concat(chunks).toString()));
        res.writeHead(204).end();
    });
    const app = express();
    app.use(requestLogging);
    app.get("/check/:token", () => {
        throw new Error("Synthetic failure");
    });
    app.use(errorHandler);
    const server = createServer(app);
    const database = await startTestApp();
    try {
        const url = await listen(webhook);
        await db.setting.create({
            data: {
                key: "alertWebhookUrl",
                value: sealApplicationSecret(
                    "setting:alertWebhookUrl",
                    Buffer.from(url),
                ),
            },
        });
        const origin = await listen(server);
        const response = await fetch(
            origin + "/check/fixture-secret?token=query-secret",
            {
                headers: { cookie: "session=cookie-secret" },
            },
        );
        assert.equal(response.status, 500);
        reportJobFailure(
            "test background job",
            new Error("Synthetic job failure"),
        );
        const until = Date.now() + 3_000;
        while (alerts.length < 2 && Date.now() < until)
            await new Promise((resolve) => setTimeout(resolve, 10));
        const request = alerts.find(
            (alert) => alert.event === "request.failed",
        );
        assert.equal(request?.requestId, response.headers.get("x-request-id"));
        assert.equal(request?.route, "/check/:token");
        assert.equal(request?.status, 500);
        assert.equal(
            alerts.find((alert) => alert.event === "job.failed")?.job,
            "test background job",
        );
        assert.doesNotMatch(
            JSON.stringify(alerts),
            /fixture-secret|query-secret|cookie-secret|Synthetic/,
        );
    } finally {
        server.close();
        webhook.close();
        await database.stop();
    }
});

it("alerts through the last known webhook while the settings database is down", async (t) => {
    const alerts: Record<string, unknown>[] = [];
    const webhook = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        alerts.push(JSON.parse(Buffer.concat(chunks).toString()));
        res.writeHead(204).end();
    });
    try {
        const url = await listen(webhook);
        setAlertWebhookReader(async () => url);
        await refreshAlertWebhook();
        // The cached value is stale, so the alert tries the database first.
        t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 120_000 });
        let reads = 0;
        setAlertWebhookReader(async () => {
            reads += 1;
            throw new Error("Synthetic database outage");
        });
        reportJobFailure("outage fixture", new Error("Synthetic failure"));
        const until = performance.now() + 3_000;
        while (!alerts.length && performance.now() < until)
            await new Promise((resolve) => setImmediate(resolve));
        assert.equal(reads, 1);
        assert.equal(alerts[0]?.job, "outage fixture");
    } finally {
        setAlertWebhookReader();
        webhook.close();
    }
});
