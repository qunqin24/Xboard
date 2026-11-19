import { z } from "zod";
import messages from "./messages.en.json";

export const localeSchema = z.enum(["zh-CN", "en-US"]);
export type Locale = z.infer<typeof localeSchema>;
export const localeBody = z.strictObject({ locale: localeSchema });
export const localeQuery = z.object({ locale: localeSchema.optional() });
export const LOCALE_DEFAULT: Locale = "zh-CN";

const dictionary: Readonly<Record<string, string>> = messages;

export function translate(
    locale: Locale,
    source: string,
    values: readonly unknown[] = [],
): string {
    const template =
        locale === "en-US" && Object.hasOwn(dictionary, source)
            ? dictionary[source]!
            : source;
    return template.replace(/\{(\d+)\}/g, (match, index: string) =>
        Number(index) < values.length ? String(values[Number(index)]) : match,
    );
}

const escaped = (value: string) => value.replace(/[.*+?${}()|[\]\\]/g, "\\$&");
const patterns = Object.keys(dictionary)
    .filter((message) => /\{\d+\}/.test(message))
    .map((source) => ({
        source,
        matcher: new RegExp(
            `^${source
                .split(/\{\d+\}/)
                .map(escaped)
                .join("(.*?)")}$`,
        ),
    }));

/** Error text arriving after interpolation can still use the same catalog. */
export function translateMessage(locale: Locale, source: string): string {
    if (locale !== "en-US") return source;
    if (Object.hasOwn(dictionary, source)) return dictionary[source]!;
    for (const { source: key, matcher } of patterns) {
        const match = matcher.exec(source);
        if (match) return translate(locale, key, match.slice(1));
    }
    const clauses = source.split("；");
    if (clauses.length > 1)
        return clauses.map((part) => translateMessage(locale, part)).join("; ");
    const colon = source.indexOf("：");
    if (colon > 0) {
        const prefix = source.slice(0, colon);
        if (/^[a-zA-Z0-9_.]+$/.test(prefix))
            return `${prefix}: ${translateMessage(locale, source.slice(colon + 1))}`;
    }
    return source;
}
