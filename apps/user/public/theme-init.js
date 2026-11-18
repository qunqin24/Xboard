// Apply the saved theme before first paint. Mirrors the theme provider.
(() => {
    const match = document.cookie.match(/(?:^|; )vite-ui-theme=([^;]*)/);
    const theme = match ? match[1] : "system";
    const dark =
        theme === "dark" ||
        (theme !== "light" &&
            matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.add(dark ? "dark" : "light");
})();
