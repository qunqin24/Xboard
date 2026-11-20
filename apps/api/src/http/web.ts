import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import express from "express";

/**
 * Serves the built React app (apps/user/dist) from the API process, so the
 * production image is a single container.
 *
 * - Vite's content-hashed files under assets/ are cached for a year.
 * - Everything else, index.html included, is revalidated on every load so a
 *   deployment takes effect at once.
 * - Other GET and HEAD paths fall back to index.html for client-side routes.
 *   A missing file under assets/ is a 404, not HTML, so a stale page never
 *   runs index.html as a script.
 *
 * Mount it after the /api router, which answers its own 404s.
 */
export function webApp(root: string): express.Router {
    const index = join(root, "index.html");
    if (!existsSync(index))
        throw new Error(`APP_WEB_DIR has no index.html: ${root}`);
    const assets = join(root, "assets") + sep;

    const router = express.Router();
    router.use(
        express.static(root, {
            index: false,
            redirect: false,
            setHeaders(res, path) {
                res.setHeader(
                    "Cache-Control",
                    path.startsWith(assets)
                        ? "public, max-age=31536000, immutable"
                        : "no-cache",
                );
            },
        }),
    );
    router.use((req, res, next) => {
        if (
            (req.method !== "GET" && req.method !== "HEAD") ||
            req.path.startsWith("/assets/")
        )
            return next();
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(index, (error) => {
            if (error) next(error);
        });
    });
    return router;
}
