// Response shapes of the /api/admin endpoints. These routes are not in the
// generated OpenAPI contract yet, so the admin UI declares what it reads.

export type Overview = {
    users: number;
    orders: number;
    nodes: number;
    openTickets: number;
    revenueMinor: number;
};

export type PlanRow = {
    id: number;
    name: string;
    content: string | null;
    transferEnable: string;
    speedLimit: number | null;
    deviceLimit: number | null;
    published: boolean;
    sort: number;
    prices: { period: string; amountMinor: number }[];
};

export type NodeRow = {
    id: number;
    name: string;
    protocol: string;
    host: string;
    port: number;
    serverName: string;
    cipher: string;
    enabled: boolean;
    lastSeenAt: string | null;
    plans: { planId: number }[];
};

export type UserRow = {
    id: number;
    email: string;
    role: string;
    balance: number;
    banned: boolean;
    transferEnable: string;
    upload: string;
    download: string;
    planId: number | null;
    expiredAt: number | null;
    verifiedAt: string | null;
    speedLimit: number | null;
    deviceLimit: number | null;
};

export type NoticeRow = {
    id: number;
    title: string;
    content: string;
    published: boolean;
};

export type OrderRow = {
    id: string;
    userId: number;
    planName: string;
    period: string;
    status: "pending" | "paid" | "cancelled";
    amountMinor: number;
    createdAt: string;
    paidAt: string | null;
    user: { email: string };
};

export type LedgerRow = {
    id: string;
    userId: number;
    amountMinor: number;
    reason: string | null;
    orderId: string | null;
    actorId: number | null;
    createdAt: string;
};

export type AuditRow = {
    id: number;
    actorId: number | null;
    action: string;
    target: string;
    detail: unknown;
    createdAt: string;
};

export type MailRow = {
    id: number;
    to: string;
    subject: string;
    attempts: number;
    sentAt: string | null;
    nextAttempt: string;
    createdAt: string;
};

export type SiteSettings = {
    siteName: string;
    registrationOpen: boolean;
    supportNote: string;
};

export type StatsDay = {
    date: string;
    revenueMinor: number;
    paidOrders: number;
    newUsers: number;
    trafficBytes: string;
};

export type Stats = {
    days: StatsDay[];
    topPlans: { planName: string; orders: number; revenueMinor: number }[];
};
