import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../src/bootstrap";
import { appDirectory } from "../src/config";

async function main() {
    const { app, document } = await createApp({
        logging: false,
        connect: false,
    });
    try {
        await writeFile(
            resolve(appDirectory, "../../packages/api-client/openapi.json"),
            `${JSON.stringify(document, null, 2)}\n`,
        );
    } finally {
        await app.close();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
