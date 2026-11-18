import { useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Account, SubscriptionLinks, TrafficDay } from "@xboard/contracts";
import {
    CalendarClock,
    ChartArea,
    Copy,
    Download,
    Gauge,
    MonitorSmartphone,
    Package,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { toast } from "sonner";
import { useAccount } from "@/api/hooks";
import { usePanel, useSite } from "@/api/panel";
import { chartAxis, chartMargin, chartTooltip } from "@/components/chart-style";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { IconBlock } from "@/components/ui/icon-block";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    daysLeft,
    formatDate,
    formatMinor,
    formatTraffic,
    remainingBytes,
    sumBytes,
    toGiB,
    usedPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    PLATFORMS,
    clientsFor,
    detectPlatform,
    recommendedClient,
} from "./clients";
import { subscriptionStatus } from "./status";

type Notice = { id: number; title: string; content: string; createdAt: string };

export function Overview() {
    const account = useAccount();
    const data = account.data;

    if (!data)
        return (
            <Page title="总览">
                {account.isError ? (
                    <ErrorState
                        error={account.error}
                        onRetry={() => void account.refetch()}
                    />
                ) : (
                    <div className="grid gap-page lg:grid-cols-3">
                        <Skeleton shape="card" className="h-72 lg:col-span-2" />
                        <Skeleton shape="card" className="h-72" />
                        <Skeleton shape="card" className="h-72 lg:col-span-3" />
                    </div>
                )}
            </Page>
        );

    const hasPlan = data.plan !== null;
    return (
        <Page
            title="总览"
            actions={
                hasPlan ? (
                    <>
                        <Button asChild variant="outline">
                            <Link to="/plans">
                                <Package />
                                续费
                            </Link>
                        </Button>
                        <CopyLinkButton />
                    </>
                ) : (
                    <Button asChild>
                        <Link to="/plans">
                            <Package />
                            选购套餐
                        </Link>
                    </Button>
                )
            }
        >
            <div className="grid gap-page lg:grid-cols-3">
                {hasPlan ? (
                    <PlanCard account={data} />
                ) : (
                    <Card className="lg:col-span-2">
                        <EmptyState
                            icon={Package}
                            title="未开通套餐"
                            description="开通后可在此查看剩余流量和到期时间。"
                            action={
                                <Button asChild>
                                    <Link to="/plans">选购套餐</Link>
                                </Button>
                            }
                        />
                    </Card>
                )}
                <NoticesCard />
                {hasPlan ? <UsageCard /> : null}
            </div>
        </Page>
    );
}

/** The subscription at a glance: quota ring, key facts, client import. */
function PlanCard({ account }: { account: Account }) {
    const used = sumBytes(account.uploadBytes, account.downloadBytes);
    const percent = usedPercent(used, account.transferBytes);
    const days = daysLeft(account.expiredAt);
    const status = subscriptionStatus(account);

    return (
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="text-lg">{account.plan?.name}</CardTitle>
                <CardAction>
                    <Badge variant={status.tone}>{status.label}</Badge>
                </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-card sm:flex-row">
                <div className="flex flex-col items-center gap-field">
                    <QuotaRing
                        percentUsed={percent}
                        remaining={formatTraffic(
                            remainingBytes(account.transferBytes, used),
                        )}
                    />
                    <p className="numeric text-xs text-muted-foreground">
                        已用 {formatTraffic(used)} / 共{" "}
                        {formatTraffic(account.transferBytes)}
                    </p>
                </div>
                <dl className="grid w-full flex-1 grid-cols-2 gap-group">
                    <Fact
                        icon={CalendarClock}
                        label="到期时间"
                        value={formatDate(account.expiredAt)}
                        hint={
                            days === null
                                ? undefined
                                : days > 0
                                  ? `剩余 ${days} 天`
                                  : "已到期"
                        }
                    />
                    <Fact
                        icon={Wallet}
                        label="余额"
                        value={formatMinor(account.balanceMinor)}
                        tip="暂不支持在线充值，请联系管理员入账。"
                    />
                    <Fact
                        icon={Gauge}
                        label="限速"
                        value={
                            account.speedLimitMbps
                                ? `${account.speedLimitMbps} Mbps`
                                : "不限"
                        }
                    />
                    <Fact
                        icon={MonitorSmartphone}
                        label="设备"
                        value={
                            account.deviceLimit
                                ? `${account.deviceLimit} 台`
                                : "不限"
                        }
                    />
                </dl>
            </CardContent>
            <CardFooter className="border-t">
                <ClientImport />
            </CardFooter>
        </Card>
    );
}

/** Remaining traffic as a ring; the arc turns warning at 90% and danger at 100%. */
function QuotaRing({
    percentUsed,
    remaining,
}: {
    percentUsed: number;
    remaining: string;
}) {
    const left = Math.max(0, 100 - percentUsed);
    const radius = 46;
    const length = 2 * Math.PI * radius;
    return (
        <svg
            viewBox="0 0 112 112"
            className="size-28 shrink-0"
            role="img"
            aria-label={`剩余流量 ${remaining}，${Math.round(left)}%`}
        >
            <circle
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                strokeWidth="10"
                className="stroke-muted"
            />
            <circle
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(left / 100) * length} ${length}`}
                transform="rotate(-90 56 56)"
                className={cn(
                    "transition-[stroke-dasharray] duration-500",
                    percentUsed >= 100
                        ? "stroke-destructive"
                        : percentUsed >= 90
                          ? "stroke-warning"
                          : "stroke-primary",
                )}
            />
            <text
                x="56"
                y="54"
                textAnchor="middle"
                className="numeric fill-foreground text-base font-semibold"
            >
                {remaining}
            </text>
            <text
                x="56"
                y="72"
                textAnchor="middle"
                className="fill-muted-foreground text-xs"
            >
                剩余 {Math.round(left)}%
            </text>
        </svg>
    );
}

function Fact({
    icon: Icon,
    label,
    value,
    hint,
    tip,
}: {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    hint?: string;
    tip?: ReactNode;
}) {
    return (
        <div className="flex items-center gap-3">
            <IconBlock>
                <Icon />
            </IconBlock>
            <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    {label}
                    {tip ? <InfoTip className="size-4">{tip}</InfoTip> : null}
                </dt>
                <dd className="numeric truncate text-sm font-medium">
                    {value}
                </dd>
                {hint ? (
                    <dd className="truncate text-xs text-muted-foreground">
                        {hint}
                    </dd>
                ) : null}
            </div>
        </div>
    );
}

/** One link for every client; created on first view and stable until reset. */
function useSubscriptionLink() {
    return usePanel<SubscriptionLinks>("/account/subscription");
}

function CopyLinkButton() {
    const links = useSubscriptionLink();
    return (
        <Button
            disabled={!links.data}
            onClick={async () => {
                if (!links.data) return;
                try {
                    await navigator.clipboard.writeText(links.data.url);
                    toast.success("已复制订阅链接");
                } catch {
                    toast.error("复制失败，请在订阅页手动复制。");
                }
            }}
        >
            <Copy />
            复制订阅链接
        </Button>
    );
}

/** The client suggested for this device first, two alternatives after it. */
function ClientImport() {
    const site = useSite();
    const links = useSubscriptionLink();
    const platform = useMemo(
        () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
        [],
    );
    const recommended = recommendedClient(platform);
    const others = clientsFor(platform)
        .filter((client) => client.id !== recommended.id)
        .slice(0, 2);
    const label = PLATFORMS.find((item) => item.value === platform)?.label;

    return (
        <div className="flex w-full flex-col gap-field">
            <div className="flex items-center justify-between gap-inline text-xs text-muted-foreground">
                <span>导入到客户端 · 已识别为 {label}</span>
                <Link
                    to="/subscription"
                    className="font-medium text-primary hover:underline"
                >
                    全部客户端
                </Link>
            </div>
            {links.isError ? (
                <p className="text-sm text-destructive">
                    订阅链接加载失败，请稍后重试。
                </p>
            ) : (
                <div className="flex flex-wrap gap-inline">
                    {[recommended, ...others].map((client, index) => (
                        <Button
                            key={client.id}
                            asChild={Boolean(links.data)}
                            disabled={!links.data}
                            size="sm"
                            variant={index === 0 ? "soft" : "outline"}
                        >
                            {links.data ? (
                                <a
                                    href={client.importUrl(
                                        links.data,
                                        site.data?.siteName ?? "Xboard",
                                    )}
                                >
                                    {index === 0 ? <Download /> : null}
                                    {index === 0
                                        ? `导入 ${client.name}`
                                        : client.name}
                                </a>
                            ) : (
                                <span>{client.name}</span>
                            )}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}

function NoticesCard() {
    const notices = usePanel<Notice[]>("/notices");
    return (
        <Card>
            <CardHeader>
                <CardTitle>公告</CardTitle>
            </CardHeader>
            <CardContent>
                {notices.isPending ? (
                    <div className="space-y-group">
                        <Skeleton className="h-12" />
                        <Skeleton className="h-12" />
                    </div>
                ) : notices.isError ? (
                    <ErrorState
                        error={notices.error}
                        onRetry={() => void notices.refetch()}
                    />
                ) : notices.data.length ? (
                    <ul className="divide-y">
                        {notices.data.slice(0, 4).map((notice) => (
                            <li
                                key={notice.id}
                                className="space-y-1 py-group first:pt-0 last:pb-0"
                            >
                                <p className="text-sm font-medium">
                                    {notice.title}
                                </p>
                                <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
                                    {notice.content}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState title="暂无公告" />
                )}
            </CardContent>
        </Card>
    );
}

const RANGES = [7, 30] as const;

/** Daily download and upload, stacked, in GB. */
function UsageCard() {
    const [range, setRange] = useState<(typeof RANGES)[number]>(7);
    const daily = usePanel<TrafficDay[]>(
        `/account/traffic/daily?days=${range}`,
    );
    const gradient = useId().replaceAll(":", "");
    const series = (daily.data ?? []).map((day) => ({
        label: day.date.slice(5).replace("-", "/"),
        download: toGiB(day.download),
        upload: toGiB(day.upload),
    }));
    const total = series.reduce(
        (sum, day) => sum + day.download + day.upload,
        0,
    );

    return (
        <Card className="lg:col-span-3">
            <CardHeader>
                <CardTitle>流量趋势</CardTitle>
                <CardDescription>
                    {daily.data
                        ? `近 ${range} 天共 ${total.toFixed(total >= 100 ? 0 : 1)} GB`
                        : "单位：GB"}
                </CardDescription>
                <CardAction>
                    <ToggleGroup
                        type="single"
                        value={String(range)}
                        onValueChange={(value) =>
                            value && setRange(Number(value) as typeof range)
                        }
                        aria-label="时间范围"
                    >
                        {RANGES.map((days) => (
                            <ToggleGroupItem key={days} value={String(days)}>
                                {days} 天
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </CardAction>
            </CardHeader>
            <CardContent>
                {daily.isError ? (
                    <ErrorState
                        error={daily.error}
                        onRetry={() => void daily.refetch()}
                    />
                ) : daily.isPending ? (
                    <Skeleton className="h-56" />
                ) : total === 0 ? (
                    <EmptyState
                        icon={ChartArea}
                        title="暂无使用记录"
                        description={`近 ${range} 天没有节点上报流量。`}
                        className="h-56"
                    />
                ) : (
                    <>
                        <ResponsiveContainer width="100%" height={224}>
                            <AreaChart data={series} margin={chartMargin}>
                                <defs>
                                    {(["chart-1", "chart-2"] as const).map(
                                        (color) => (
                                            <linearGradient
                                                key={color}
                                                id={`${gradient}-${color}`}
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="0%"
                                                    stopColor={`var(--${color})`}
                                                    stopOpacity={0.35}
                                                />
                                                <stop
                                                    offset="100%"
                                                    stopColor={`var(--${color})`}
                                                    stopOpacity={0.02}
                                                />
                                            </linearGradient>
                                        ),
                                    )}
                                </defs>
                                <CartesianGrid
                                    vertical={false}
                                    stroke="var(--border)"
                                    strokeDasharray="3 3"
                                />
                                <XAxis
                                    dataKey="label"
                                    {...chartAxis}
                                    minTickGap={24}
                                />
                                <YAxis
                                    {...chartAxis}
                                    width={48}
                                    tickFormatter={(value) =>
                                        Number(value).toFixed(1)
                                    }
                                />
                                <Tooltip
                                    {...chartTooltip}
                                    formatter={(value, name) => [
                                        `${Number(value).toFixed(2)} GB`,
                                        name === "download" ? "下载" : "上传",
                                    ]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="download"
                                    stackId="traffic"
                                    stroke="var(--chart-1)"
                                    fill={`url(#${gradient}-chart-1)`}
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="upload"
                                    stackId="traffic"
                                    stroke="var(--chart-2)"
                                    fill={`url(#${gradient}-chart-2)`}
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                        <div className="mt-field flex justify-center gap-group text-xs text-muted-foreground">
                            {[
                                ["下载", "bg-chart-1"],
                                ["上传", "bg-chart-2"],
                            ].map(([label, color]) => (
                                <span
                                    key={label}
                                    className="flex items-center gap-1"
                                >
                                    <span
                                        className={cn(
                                            "size-2 rounded-full",
                                            color,
                                        )}
                                    />
                                    {label}
                                </span>
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
