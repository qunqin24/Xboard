/**
 * How many rows a list showed last time, kept in memory only, so the next
 * skeleton draws the same number and the page does not jump when data arrives.
 */
const counts = new Map<string, number>();

export function rememberCount(key: string, count: number) {
    if (count > 0) counts.set(key, count);
}

export function skeletonCount(key: string, fallback: number) {
    return counts.get(key) ?? fallback;
}
