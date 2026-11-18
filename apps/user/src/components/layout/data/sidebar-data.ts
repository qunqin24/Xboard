import {
    ClipboardList,
    BookOpen,
    CreditCard,
    FileText,
    LayoutDashboard,
    Link2,
    Mail,
    Megaphone,
    MessagesSquare,
    Package,
    Palette,
    Receipt,
    ScrollText,
    Server,
    Settings,
    ShieldCheck,
    TicketPercent,
    UserCog,
    UserPlus,
    Users,
    Wallet,
} from "lucide-react";
import { type NavGroup } from "../types";

/** Navigation for every signed-in account. */
export const userNav: NavGroup[] = [
    {
        title: "用户中心",
        items: [
            { title: "总览", url: "/", icon: LayoutDashboard },
            { title: "选购套餐", url: "/plans", icon: Package },
            { title: "我的订单", url: "/orders", icon: Receipt },
            { title: "订阅链接", url: "/subscription", icon: Link2 },
            { title: "帮助文档", url: "/help", icon: BookOpen },
            { title: "使用记录", url: "/records", icon: FileText },
            { title: "工单", url: "/tickets", icon: MessagesSquare },
        ],
    },
    {
        title: "设置",
        items: [
            {
                title: "账户设置",
                icon: Settings,
                items: [
                    { title: "账户", url: "/settings", icon: UserCog },
                    {
                        title: "安全",
                        url: "/settings/security",
                        icon: ShieldCheck,
                    },
                    {
                        title: "邀请",
                        url: "/settings/invite",
                        icon: UserPlus,
                    },
                    {
                        title: "外观",
                        url: "/settings/appearance",
                        icon: Palette,
                    },
                ],
            },
        ],
    },
];

/** Navigation for the admin console; only shown to admins. */
export const adminNav: NavGroup[] = [
    {
        title: "运营",
        items: [{ title: "仪表盘", url: "/admin", icon: LayoutDashboard }],
    },
    {
        title: "商品",
        items: [
            { title: "套餐", url: "/admin/plans", icon: Package },
            {
                title: "优惠与兑换",
                url: "/admin/promotions",
                icon: TicketPercent,
            },
            { title: "节点", url: "/admin/nodes", icon: Server },
        ],
    },
    {
        title: "用户与财务",
        items: [
            { title: "用户", url: "/admin/users", icon: Users },
            { title: "订单", url: "/admin/orders", icon: CreditCard },
            { title: "余额流水", url: "/admin/ledger", icon: Wallet },
        ],
    },
    {
        title: "内容与支持",
        items: [
            { title: "公告", url: "/admin/notices", icon: Megaphone },
            { title: "帮助文档", url: "/admin/help", icon: BookOpen },
            { title: "工单", url: "/admin/tickets", icon: MessagesSquare },
        ],
    },
    {
        title: "系统",
        items: [
            { title: "审计日志", url: "/admin/audit", icon: ClipboardList },
            { title: "邮件队列", url: "/admin/mail", icon: Mail },
            { title: "系统设置", url: "/admin/settings", icon: ScrollText },
        ],
    },
];
