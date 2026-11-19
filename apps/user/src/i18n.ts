import {
    LOCALE_DEFAULT,
    localeSchema,
    translate,
    type Locale,
} from "@xboard/contracts";

const storageKey = "xboard.locale";
let active: Locale = LOCALE_DEFAULT;

export function currentLocale() {
    return active;
}
export function uiText(key: string, values?: readonly unknown[]) {
    return translate(active, key, values);
}
export function chosenLocale(): Locale | undefined {
    try {
        const value = localeSchema.safeParse(localStorage.getItem(storageKey));
        return value.success ? value.data : undefined;
    } catch {
        return undefined;
    }
}
export function storeLocale(locale: Locale) {
    try {
        localStorage.setItem(storageKey, locale);
    } catch {
        /* Storage may be disabled. */
    }
}
export async function initializeLocale() {
    const chosen = chosenLocale();
    if (chosen) active = chosen;
    else {
        try {
            const response = await fetch("/api/site/locale", {
                credentials: "same-origin",
                signal: AbortSignal.timeout(4000),
            });
            if (response.ok) {
                const value = localeSchema.safeParse(
                    (await response.json()).locale,
                );
                if (value.success) active = value.data;
            }
        } catch {
            /* Use the default while the API is unavailable. */
        }
    }
    document.documentElement.lang = active;
}
