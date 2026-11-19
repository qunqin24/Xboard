import { createApp } from "./app";
import { getConfig } from "./config";
import { closeDb } from "./db";
import { startJobs } from "./jobs";
import { errorFields, log } from "./logging";
import { initializeInstallation } from "./modules/system/setup";

async function main() {
    const config = getConfig();
    await initializeInstallation();
    const app = createApp();
    await app.listen(config.port, config.host);
    log("info", "api.listening", { address: app.getUrl() });
    const stopJobs = startJobs();

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) return;
        stopping = true;
        log("info", "api.shutting_down", { signal });
        stopJobs();
        await app.close();
        await closeDb();
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
    log("error", "api.start_failed", { error: errorFields(error) });
    process.exitCode = 1;
});
