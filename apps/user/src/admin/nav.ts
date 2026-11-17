import {
    ChatsCircle,
    ClipboardText,
    EnvelopeSimple,
    GearSix,
    HardDrives,
    Megaphone,
    Package,
    Receipt,
    SquaresFour,
    Users,
    Wallet,
    type Icon,
} from "@phosphor-icons/react";

export type AdminPath =
    | "/admin"
    | "/admin/plans"
    | "/admin/nodes"
    | "/admin/users"
    | "/admin/orders"
    | "/admin/ledger"
    | "/admin/notices"
    | "/admin/tickets"
    | "/admin/audit"
    | "/admin/mail"
    | "/admin/settings";

export type NavItem = {
    to: AdminPath;
    label: string;
    icon: Icon;
    keywords?: string;
};

export const NAV: { label: string; items: NavItem[] }[] = [
    {
        label: "运营",
        items: [
            {
                to: "/admin",
                label: "概览",
                icon: SquaresFour,
                keywords: "dashboard 仪表盘 统计",
            },
        ],
    },
    {
        label: "商品",
        items: [
            {
                to: "/admin/plans",
                label: "套餐",
                icon: Package,
                keywords: "plan 价格",
            },
            {
                to: "/admin/nodes",
                label: "节点",
                icon: HardDrives,
                keywords: "node server 服务器",
            },
        ],
    },
    {
        label: "用户与财务",
        items: [
            {
                to: "/admin/users",
                label: "用户",
                icon: Users,
                keywords: "user 入账 封禁",
            },
            {
                to: "/admin/orders",
                label: "订单",
                icon: Receipt,
                keywords: "order",
            },
            {
                to: "/admin/ledger",
                label: "余额流水",
                icon: Wallet,
                keywords: "ledger balance",
            },
        ],
    },
    {
        label: "内容与支持",
        items: [
            {
                to: "/admin/notices",
                label: "公告",
                icon: Megaphone,
                keywords: "notice",
            },
            {
                to: "/admin/tickets",
                label: "工单",
                icon: ChatsCircle,
                keywords: "ticket 客服",
            },
        ],
    },
    {
        label: "系统",
        items: [
            {
                to: "/admin/audit",
                label: "审计日志",
                icon: ClipboardText,
                keywords: "audit log",
            },
            {
                to: "/admin/mail",
                label: "邮件队列",
                icon: EnvelopeSimple,
                keywords: "mail smtp",
            },
            {
                to: "/admin/settings",
                label: "系统设置",
                icon: GearSix,
                keywords: "settings 注册 站点",
            },
        ],
    },
];

/** Finds the nav entry (and its group) for the current pathname. */
export function locate(pathname: string) {
    const path = pathname.replace(/\/$/, "") || "/admin";
    for (const group of NAV)
        for (const item of group.items)
            if (
                item.to === path ||
                (item.to !== "/admin" && path.startsWith(`${item.to}/`))
            )
                return { group: group.label, item };
    return null;
}
