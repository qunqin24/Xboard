// CSV export for admin tables. Kept free of React so it can be unit tested.

export type CsvValue = string | number | bigint | boolean | null | undefined;

/**
 * One CSV cell. Quotes are doubled, and text that a spreadsheet would read as
 * a formula (= + - @, tab, CR) gets a leading apostrophe so exported user data
 * cannot run as a formula when the file is opened. Real numbers are left alone.
 */
export function csvCell(value: CsvValue): string {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text))
        text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(
    headers: readonly string[],
    rows: readonly CsvValue[][],
): string {
    return [headers, ...rows]
        .map((line) => line.map(csvCell).join(","))
        .join("\r\n");
}

/** Downloads as UTF-8 with a BOM so Excel shows Chinese text correctly. */
export function downloadCsv(name: string, csv: string) {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const url = URL.createObjectURL(
        new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}-${date}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
