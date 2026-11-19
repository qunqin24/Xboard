import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { getSettingSecret } from "./modules/system/settings";

type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

export function log(level: LogLevel, event: string, fields: LogFields = {}) {
    const stream = level === "info" ? process.stdout : process.stderr;
    stream.write(
        JSON.stringify({
            time: new Date().toISOString(),
            level,
            event,
            ...fields,
        }) + "\n",
    );
}

/** Messages from parsers, Prisma and SMTP may include user-supplied data. */
export function errorFields(error: unknown): {
    type: string;
    code?: string;
    stack?: string[];
} {
    if (!(error instanceof Error)) return { type: "UnknownError" };
    const type = error.constructor.name;
    const stack = (error.stack ?? "")
        .slice(
            (error.stack ?? "").startsWith(`${error.name}: ${error.message}`)
                ? error.name.length + 2 + error.message.length
                : (error.stack ?? "").startsWith(error.message)
                  ? error.message.length
                  : 0,
        )
        .split("\n")
        .filter((line) => line.startsWith("    at "))
        .slice(0, 12);
    const code = "code" in error ? error.code : undefined;
    return {
        type,
        ...(typeof code === "string" &&
            /^(?:P\d{4}|E[A-Z_]{2,28})$/.test(code) && { code }),
        stack,
    };
}

type Alert =
    | {
          event: "request.failed";
          requestId: string;
          status: number;
          route?: string;
      }
    | {
          event: "job.failed";
          job: string;
      };

export async function sendAlertWebhook(value: string, payload: LogFields) {
    const url = new URL(value);
    if (
        url.protocol !== "https:" &&
        !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        )
    )
        throw new Error("Invalid webhook protocol");
    const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, time: new Date().toISOString() }),
        signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
    if (!response.ok)
        throw new Error(`Alert webhook returned ${response.status}.`);
}

type WebhookReader = () => Promise<string | null>;
const readWebhookSetting: WebhookReader = () =>
    getSettingSecret("alertWebhookUrl");
let readWebhook = readWebhookSetting;
let cachedWebhook: { url: string | null; readAt: number } | undefined;

/** Tests swap the settings reader to simulate a database outage. */
export function setAlertWebhookReader(
    reader: WebhookReader = readWebhookSetting,
) {
    readWebhook = reader;
}

/** Called every minute by the jobs so the last known URL survives an outage. */
export async function refreshAlertWebhook() {
    const url = await readWebhook();
    cachedWebhook = { url, readAt: Date.now() };
    return url;
}

/**
 * The URL lives in the database, and a database outage is exactly when an
 * alert matters most, so fall back to the last value read successfully.
 */
async function alertWebhookUrl() {
    if (cachedWebhook && Date.now() - cachedWebhook.readAt < 60_000)
        return cachedWebhook.url;
    try {
        return await refreshAlertWebhook();
    } catch (error) {
        if (!cachedWebhook) throw error;
        log("warn", "alert.settings_unavailable", {
            error: errorFields(error),
        });
        return cachedWebhook.url;
    }
}

const lastAlert = new Map<string, number>();
export async function alertFailure(alert: Alert) {
    const key = alert.event === "job.failed" ? alert.job : alert.event;
    if (Date.now() - (lastAlert.get(key) ?? 0) < 60_000) return;
    let url: string | null;
    try {
        url = await alertWebhookUrl();
    } catch (error) {
        log("warn", "alert.delivery_failed", { error: errorFields(error) });
        return;
    }
    if (!url) return;
    // Throttle only once a delivery is actually attempted; re-check after the
    // lookup so concurrent failures still send a single alert.
    const now = Date.now();
    if (now - (lastAlert.get(key) ?? 0) < 60_000) return;
    lastAlert.set(key, now);
    try {
        await sendAlertWebhook(url, alert);
    } catch (error) {
        log("warn", "alert.delivery_failed", { error: errorFields(error) });
    }
}

export function reportJobFailure(
    job: string,
    error: unknown,
    fields: LogFields = {},
) {
    log("error", "job.failed", { job, error: errorFields(error), ...fields });
    void alertFailure({ event: "job.failed", job });
}

export const requestLogging: RequestHandler = (req, res, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    res.setHeader("X-Request-Id", requestId);
    let logged = false;
    const complete = () => {
        if (logged) return;
        logged = true;
        // Express supplies the matched template, never the URL, query or cookies.
        const route =
            typeof req.route?.path === "string" ? req.route.path : undefined;
        const failed =
            res.statusCode >= 500 || res.locals.requestError !== undefined;
        log(failed ? "error" : "info", "http.request", {
            requestId,
            method: req.method,
            route,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - started),
            aborted: !res.writableFinished,
            error: res.locals.requestError,
        });
        if (failed)
            void alertFailure({
                event: "request.failed",
                requestId,
                route,
                status: res.statusCode,
            });
    };
    res.once("finish", complete);
    res.once("close", complete);
    next();
};
