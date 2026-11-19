import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Walk up from src/ or dist/ to find apps/api, regardless of cwd.
function findAppDirectory(start: string): string {
    let directory = start;
    for (let depth = 0; depth < 4; depth += 1) {
        if (existsSync(resolve(directory, "prisma", "schema.prisma")))
            return directory;
        directory = dirname(directory);
    }
    throw new Error("Could not locate apps/api from the running file.");
}

export const appDirectory = findAppDirectory(import.meta.dirname);
config({ path: resolve(appDirectory, ".env"), quiet: true });

export function getConfig() {
    const environment = process.env.NODE_ENV ?? "development";
    if (!["development", "test", "production"].includes(environment))
        throw new Error("Invalid NODE_ENV.");
    const production = environment === "production";
    const port = Number(process.env.API_PORT ?? 3001);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error("API_PORT must be an integer between 1024 and 65535.");
    }
    const origin = new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:5173");
    if (
        !["http:", "https:"].includes(origin.protocol) ||
        (!production &&
            !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) ||
        (production && origin.protocol !== "https:") ||
        origin.origin !== origin.href.replace(/\/$/, "")
    ) {
        throw new Error(
            "APP_ORIGIN must be a full origin without a path, using HTTPS in production.",
        );
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (
        !databaseUrl ||
        !["postgres:", "postgresql:"].includes(new URL(databaseUrl).protocol)
    ) {
        throw new Error(
            "Set DATABASE_URL to your PostgreSQL database in apps/api/.env.",
        );
    }
    return {
        environment,
        production,
        host: process.env.API_HOST ?? "127.0.0.1",
        port,
        origin: origin.origin,
        databaseUrl,
        trustProxy: parseTrustProxy(process.env.TRUSTED_PROXY),
    };
}

export type Config = ReturnType<typeof getConfig>;

/**
 * Express "trust proxy": unset means the socket address is the client.
 * Production sets the reverse proxy's address, e.g. TRUSTED_PROXY=172.30.56.2.
 */
function parseTrustProxy(value: string | undefined): boolean | number | string {
    if (!value || value === "false") return false;
    if (value === "true") return true;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
}
