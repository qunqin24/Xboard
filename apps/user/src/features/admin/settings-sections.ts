import {
    Bell,
    Coins,
    CreditCard,
    Database,
    Globe,
    Info,
    Mail,
    ShieldCheck,
    UserPlus,
    type LucideIcon,
} from "lucide-react";

/** Sections of the admin settings page, in navigation order. */
export const SETTINGS_SECTIONS = [
    {
        id: "site",
        title: "站点",
        description: "站点名称、客服说明和访客默认语言。",
        icon: Globe,
    },
    {
        id: "registration",
        title: "注册与新用户",
        description: "谁可以注册、邮箱限制、条款链接和新用户赠送的试用。",
        icon: UserPlus,
    },
    {
        id: "mail",
        title: "邮件",
        description: "发信服务和发给用户的到期、流量提醒。",
        icon: Mail,
    },
    {
        id: "notifications",
        title: "管理员通知",
        description: "新工单、新订单和节点离线等通知发往哪里。",
        icon: Bell,
    },
    {
        id: "payments",
        title: "支付",
        description: "在线支付网关和支付回执。",
        icon: CreditCard,
    },
    {
        id: "commission",
        title: "佣金与提现",
        description: "邀请返佣规则和提现申请审核。",
        icon: Coins,
    },
    {
        id: "security",
        title: "安全",
        description: "人机验证和应用密钥。",
        icon: ShieldCheck,
    },
    {
        id: "backup",
        title: "备份",
        description: "每日自动备份到对象存储。",
        icon: Database,
    },
    {
        id: "about",
        title: "关于",
        description: "当前版本和检查更新。",
        icon: Info,
    },
] as const satisfies readonly {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
}[];

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export const SETTINGS_SECTION_IDS = SETTINGS_SECTIONS.map(
    (section) => section.id,
) as [SettingsSectionId, ...SettingsSectionId[]];
