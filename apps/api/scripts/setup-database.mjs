import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
config({ path: resolve(appDirectory, ".env"), quiet: true });
if (!process.env.DATABASE_URL?.startsWith("postgresql://")) {
    throw new Error("Set DATABASE_URL to the new PostgreSQL database.");
}
for (const args of [["generate"], ["migrate", "deploy"]]) {
    const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
        cwd: appDirectory,
        env: process.env,
        stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
