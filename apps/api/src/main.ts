import { createApp } from "./bootstrap";
import { getConfig } from "./config";

async function main() {
    const { app } = await createApp();
    app.enableShutdownHooks();
    await app.listen(getConfig().port, getConfig().host);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
