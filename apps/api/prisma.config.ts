import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// With a config file present Prisma no longer loads .env on its own. Local
// development keeps it at the repository root; a deployed image has none.
const workspaceDirectory = resolve(import.meta.dirname, "..", "..");
if (existsSync(resolve(workspaceDirectory, "pnpm-workspace.yaml")))
    config({ path: resolve(workspaceDirectory, ".env"), quiet: true });

export default defineConfig({
    schema: "prisma/schema.prisma",
});
