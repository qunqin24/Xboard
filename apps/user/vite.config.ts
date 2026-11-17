import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
    plugins: [
        // File-based routes under src/routes; regenerates src/routeTree.gen.ts.
        tanstackRouter({ target: "react", autoCodeSplitting: true }),
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
        proxy: {
            "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
        },
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
