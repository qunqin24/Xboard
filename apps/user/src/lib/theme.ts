import { useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";

const KEY = "xboard-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function read(): ThemePreference {
    try {
        const value = localStorage.getItem(KEY);
        return value === "light" || value === "dark" ? value : "system";
    } catch {
        return "system";
    }
}

/** Applies the resolved theme to <html data-theme>; index.html does the same pre-paint. */
function apply(preference: ThemePreference) {
    const dark =
        preference === "dark" || (preference === "system" && media().matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setTheme(preference: ThemePreference) {
    try {
        if (preference === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, preference);
    } catch {
        /* Storage may be blocked; the choice still applies to this page. */
    }
    apply(preference);
    listeners.forEach((listener) => listener());
}

export function cycleTheme(current: ThemePreference): ThemePreference {
    return current === "light"
        ? "dark"
        : current === "dark"
          ? "system"
          : "light";
}

export const THEME_LABEL: Record<ThemePreference, string> = {
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
};

export function useTheme(): ThemePreference {
    const preference = useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        read,
        () => "system" as const,
    );
    // Follow OS changes while the preference is "system".
    useEffect(() => {
        if (preference !== "system") return;
        const query = media();
        const onChange = () => apply("system");
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, [preference]);
    return preference;
}
