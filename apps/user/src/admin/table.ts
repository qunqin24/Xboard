// Pure helpers behind the admin DataTable: sorting, filtering, paging, CSV.
// Kept free of React so they can be unit tested directly.

export type SortValue = string | number | bigint | boolean | null | undefined;
export type SortState = { key: string; dir: "asc" | "desc" } | null;

const collator = new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base",
});

/** Orders values of one column; empty values always sort last. */
export function compareValues(a: SortValue, b: SortValue): number {
    const emptyA = a === null || a === undefined || a === "";
    const emptyB = b === null || b === undefined || b === "";
    if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "bigint" && typeof b === "bigint")
        return a === b ? 0 : a < b ? -1 : 1;
    if (typeof a === "boolean" && typeof b === "boolean")
        return Number(a) - Number(b);
    return collator.compare(String(a), String(b));
}

export function sortRows<T>(
    rows: readonly T[],
    value: ((row: T) => SortValue) | undefined,
    dir: "asc" | "desc",
): T[] {
    if (!value) return [...rows];
    const sign = dir === "asc" ? 1 : -1;
    return rows
        .map((row, index) => ({ row, index, key: value(row) }))
        .sort((x, y) => {
            const emptyX =
                x.key === null || x.key === undefined || x.key === "";
            const emptyY =
                y.key === null || y.key === undefined || y.key === "";
            // Empty values stay at the bottom in both directions.
            if (emptyX !== emptyY) return emptyX ? 1 : -1;
            return compareValues(x.key, y.key) * sign || x.index - y.index;
        })
        .map(({ row }) => row);
}

export function filterRows<T>(
    rows: readonly T[],
    {
        search,
        searchText,
        facets,
    }: {
        search: string;
        searchText?: (row: T) => string;
        facets: { value: (row: T) => string; selected: ReadonlySet<string> }[];
    },
): T[] {
    const term = search.trim().toLowerCase();
    return rows.filter(
        (row) =>
            (!term ||
                !searchText ||
                searchText(row).toLowerCase().includes(term)) &&
            facets.every(
                (facet) =>
                    facet.selected.size === 0 ||
                    facet.selected.has(facet.value(row)),
            ),
    );
}

export function paginate<T>(rows: readonly T[], page: number, size: number) {
    const pageCount = Math.max(1, Math.ceil(rows.length / size));
    const current = Math.min(Math.max(1, page), pageCount);
    return {
        page: current,
        pageCount,
        rows: rows.slice((current - 1) * size, current * size),
    };
}

/** Counts rows per facet value, used for the numbers in filter menus. */
export function countBy<T>(rows: readonly T[], value: (row: T) => string) {
    const counts = new Map<string, number>();
    for (const row of rows)
        counts.set(value(row), (counts.get(value(row)) ?? 0) + 1);
    return counts;
}

/**
 * One CSV cell. Quotes are doubled, and cells that a spreadsheet would read as
 * a formula (= + - @, tab, CR) get a leading apostrophe so exported user data
 * cannot run as a formula when the file is opened.
 */
export function csvCell(value: SortValue): string {
    if (value === null || value === undefined) return "";
    let text = String(value);
    // Real numbers are safe; only text can smuggle a formula.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text))
        text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(
    headers: readonly string[],
    rows: readonly SortValue[][],
): string {
    return [headers, ...rows]
        .map((line) => line.map(csvCell).join(","))
        .join("\r\n");
}

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
