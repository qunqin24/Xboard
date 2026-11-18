// Data uses decimal byte strings end to end; this module is the only place
// that turns them into display units, so rounding rules stay consistent.

const GIB = 1024 ** 3;

export function toGiB(bytes: string): number {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0)
        throw new Error(`Invalid byte count: ${bytes}`);
    return value / GIB;
}

export function formatTraffic(bytes: string): string {
    const gib = toGiB(bytes);
    if (gib === 0) return "0 GB";
    return `${gib >= 100 ? gib.toFixed(0) : gib.toFixed(1)} GB`;
}

export function usedPercent(used: string, total: string): number {
    const quota = Number(total);
    if (!Number.isFinite(quota) || quota <= 0) return 0;
    const ratio = Number(used) / quota;
    return Math.min(100, Math.max(0, ratio * 100));
}

export function sumBytes(...values: string[]): string {
    return values
        .reduce((total, value) => total + BigInt(value), 0n)
        .toString();
}

export function remainingBytes(total: string, used: string): string {
    const left = BigInt(total) - BigInt(used);
    return (left > 0n ? left : 0n).toString();
}

export function formatMinor(minor: number): string {
    return `¥${(minor / 100).toFixed(2)}`;
}

export function formatSettlement(minor: number): string {
    return minor < 0 ? `退回 ${formatMinor(-minor)}` : formatMinor(minor);
}

const PERIOD_LABELS: Record<string, string> = {
    monthly: "月付",
    quarterly: "季付",
    half_yearly: "半年付",
    yearly: "年付",
    two_yearly: "两年付",
    three_yearly: "三年付",
    onetime: "一次性",
    reset_traffic: "重置流量",
};

export function periodLabel(period: string | null): string {
    return period === null ? "流量重置包" : (PERIOD_LABELS[period] ?? period);
}

export function formatDate(unixSeconds: number | null): string {
    if (unixSeconds === null) return "长期有效";
    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
    }).format(new Date(unixSeconds * 1000));
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
    }).format(date);
}

export function daysLeft(
    unixSeconds: number | null,
    now = Date.now(),
): number | null {
    if (unixSeconds === null) return null;
    return Math.ceil((unixSeconds * 1000 - now) / 86_400_000);
}
