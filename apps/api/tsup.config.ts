import { defineConfig } from "tsup";

// ESM bundles for production: the server and the admin:create CLI.
// Workspace packages (contracts) are bundled in; npm dependencies stay
// external and are installed in the image.
export default defineConfig({
    entry: { server: "src/server.ts", admin: "scripts/admin.ts" },
    format: "esm",
    platform: "node",
    target: "node22",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    noExternal: [/^@xboard\//],
});
