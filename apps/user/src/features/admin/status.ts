// One place for admin status labels and their badge tones, so the dashboard
// and the list pages always agree. Tones follow docs/design-system.md:
// success = working/done, warning = needs attention soon, danger = failed or
// blocked, info = in progress, secondary = neutral/inactive.

import {
    CircleCheck,
    CircleDashed,
    CircleX,
    Clock,
    PowerOff,
    Wifi,
    WifiOff,
    type LucideIcon,
} from "lucide-react";

export type StatusTone =
    "success" | "warning" | "danger" | "info" | "secondary";

export const ORDER_STATUS = {
    paid: { label: "已支付", tone: "success" },
    pending: { label: "待支付", tone: "warning" },
    cancelled: { label: "已取消", tone: "secondary" },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export const ORDER_STATUS_ICON: Record<keyof typeof ORDER_STATUS, LucideIcon> =
    {
        paid: CircleCheck,
        pending: Clock,
        cancelled: CircleX,
    };

/** Keyed by the labels nodeState() returns. */
export const NODE_STATE_ICON = {
    在线: Wifi,
    离线: WifiOff,
    未连接: CircleDashed,
    已停用: PowerOff,
} as const satisfies Record<keyof typeof NODE_STATE_TONE, LucideIcon>;

/** Keyed by the labels nodeState() returns. */
export const NODE_STATE_TONE = {
    在线: "success",
    离线: "danger",
    未连接: "warning",
    已停用: "secondary",
} as const satisfies Record<string, StatusTone>;

/** Keyed by the labels mailStatus() returns. */
export const MAIL_STATUS_TONE: Record<string, StatusTone> = {
    已发送: "success",
    排队中: "info",
    重试中: "warning",
    已放弃: "danger",
};

/** Plans and notices: live vs draft. */
export const PUBLISH_TONE: Record<string, StatusTone> = {
    销售中: "success",
    已发布: "success",
    草稿: "secondary",
};
