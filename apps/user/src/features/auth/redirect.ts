/**
 * Only same-origin paths are honoured after sign-in, so a crafted
 * `?redirect=` link cannot bounce the user to another site.
 */
export function safeRedirect(target: string | undefined): string {
    if (!target) return "/";
    try {
        const url = new URL(target, "http://local.invalid");
        if (url.origin !== "http://local.invalid") return "/";
        const path = `${url.pathname}${url.search}${url.hash}`;
        return path.startsWith("/sign-") ? "/" : path;
    } catch {
        return "/";
    }
}
