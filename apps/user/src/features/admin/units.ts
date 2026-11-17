// Form units for the admin console: people type GB and yuan, the API stores
// bytes (decimal string) and integer fen.

export const GIB = 1024 ** 3;

export const bytesToGiB = (bytes: string) =>
    Number((Number(bytes) / GIB).toFixed(2)).toString();

export const giBToBytes = (value: string | number) =>
    String(Math.round(Number(value) * GIB));

export const yuanToMinor = (value: string | number) =>
    Math.round(Number(value) * 100);

export const minorToYuan = (minor: number) => (minor / 100).toFixed(2);

const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
});

/** Unix seconds → YYYY-MM-DD in Asia/Shanghai. */
export const toDateInput = (seconds: number | null) =>
    seconds === null ? "" : shanghaiDate.format(new Date(seconds * 1000));

/** YYYY-MM-DD → the end of that day in Asia/Shanghai, as unix seconds. */
export const fromDateInput = (value: string) =>
    value ? Math.floor(Date.parse(`${value}T23:59:59+08:00`) / 1000) : null;

/** Online means the node reported within the last three minutes. */
export function nodeState(
    node: { enabled: boolean; lastSeenAt: string | null },
    now = Date.now(),
) {
    if (!node.enabled) return "已停用";
    if (!node.lastSeenAt) return "未连接";
    return now - Date.parse(node.lastSeenAt) < 3 * 60 * 1000 ? "在线" : "离线";
}
