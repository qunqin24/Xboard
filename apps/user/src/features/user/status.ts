import type { Account } from "@xboard/contracts";
import { daysLeft, usedPercent } from "@/lib/format";

/** Badge variants that carry status meaning; see docs/design-system.md. */
export type Tone = "success" | "warning" | "danger" | "secondary";

/** How an order reads to its owner; a pending order past its window is shown as timed out. */
export function orderStatus(
    status: string,
    expiresAt: string,
    now = Date.now(),
) {
    if (status === "paid")
        return { label: "已开通", tone: "success" as Tone, payable: false };
    if (status === "cancelled")
        return { label: "已取消", tone: "secondary" as Tone, payable: false };
    if (Date.parse(expiresAt) <= now)
        return { label: "已超时", tone: "secondary" as Tone, payable: false };
    return { label: "待支付", tone: "warning" as Tone, payable: true };
}

/** Subscription health shown on the overview. */
export function subscriptionStatus(
    account: Pick<
        Account,
        "plan" | "expiredAt" | "uploadBytes" | "downloadBytes" | "transferBytes"
    >,
    now = Date.now(),
) {
    if (!account.plan) return { label: "未开通", tone: "secondary" as Tone };
    const days = daysLeft(account.expiredAt ?? null, now);
    if (days !== null && days <= 0)
        return { label: "已到期", tone: "danger" as Tone };
    const used = (
        BigInt(account.uploadBytes) + BigInt(account.downloadBytes)
    ).toString();
    const percent = usedPercent(used, account.transferBytes);
    if (percent >= 100) return { label: "流量已用完", tone: "danger" as Tone };
    if (percent >= 90)
        return { label: "流量即将用完", tone: "warning" as Tone };
    return { label: "正常", tone: "success" as Tone };
}
