import { createApp } from "./app";
import { getConfig } from "./config";
import { closeDb } from "./db";
import { startJobs } from "./jobs";

async function main() {
    const config = getConfig();
    const app = createApp();
    await app.listen(config.port, config.host);
    console.log(`API listening on ${app.getUrl()}`);
    const stopJobs = startJobs();

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) return;
        stopping = true;
        console.log(`${signal} received, shutting down.`);
        stopJobs();
        await app.close();
        await closeDb();
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
