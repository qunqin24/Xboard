import { Link } from "@tanstack/react-router";
import { Gauge, Link2, Megaphone, Package, Wallet } from "lucide-react";
import { useAccount } from "@/api/hooks";
import { usePanel } from "@/api/panel";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    daysLeft,
    formatDate,
    formatMinor,
    formatTraffic,
    remainingBytes,
    sumBytes,
    usedPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { subscriptionStatus } from "./status";

function Stat({
    title,
    icon: Icon,
    value,
    hint,
}: {
    title: string;
    icon: React.ElementType;
    value: React.ReactNode;
    hint?: React.ReactNode;
}) {
    return (
        <Card className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="numeric text-2xl font-bold">{value}</div>
                {hint ? (
                    <p className="text-xs text-muted-foreground">{hint}</p>
                ) : null}
            </CardContent>
        </Card>
    );
}

export function Overview() {
    const account = useAccount();
    const notices =
        usePanel<{ id: number; title: string; content: string }[]>("/notices");
    const data = account.data;

    if (!data)
        return (
            <Page title="总览">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-28" />
                    ))}
                </div>
            </Page>
        );

    const used = sumBytes(data.uploadBytes, data.downloadBytes);
    const percent = usedPercent(used, data.transferBytes);
    const days = daysLeft(data.expiredAt ?? null);
    const status = subscriptionStatus(data);

    return (
        <Page
            title="总览"
            description={
                data.plan
                    ? `${data.plan.name}，有效期至 ${formatDate(data.expiredAt ?? null)}`
                    : "还没有开通套餐。"
            }
            actions={
                <>
                    <Link
                        to="/plans"
                        className={buttonVariants({
                            variant: data.plan ? "outline" : "default",
                        })}
                    >
                        <Package /> {data.plan ? "续费" : "选购套餐"}
                    </Link>
                    {data.plan ? (
                        <Link to="/subscription" className={buttonVariants()}>
                            <Link2 /> 订阅链接
                        </Link>
                    ) : null}
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                    title="剩余流量"
                    icon={Gauge}
                    value={formatTraffic(
                        remainingBytes(data.transferBytes, used),
                    )}
                    hint={`已用 ${Math.round(percent)}%，共 ${formatTraffic(data.transferBytes)}`}
                />
                <Stat
                    title="当前套餐"
                    icon={Package}
                    value={
                        <span className="font-sans">
                            {data.plan?.name ?? "未开通"}
                        </span>
                    }
                    hint={
                        data.plan
                            ? days === null
                                ? "长期有效"
                                : days > 0
                                  ? `还剩 ${days} 天`
                                  : "已到期"
                            : "选购后立即开通"
                    }
                />
                <Stat
                    title="账户余额"
                    icon={Wallet}
                    value={formatMinor(data.balanceMinor)}
                    hint="暂不支持在线充值，请联系管理员入账"
                />
                <Stat
                    title="限速 / 设备"
                    icon={Gauge}
                    value={
                        data.speedLimitMbps
                            ? `${data.speedLimitMbps} Mbps`
                            : "不限速"
                    }
                    hint={
                        data.deviceLimit
                            ? `最多 ${data.deviceLimit} 台设备`
                            : "设备数不限"
                    }
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle>流量用量</CardTitle>
                            <Badge variant={status.tone}>{status.label}</Badge>
                        </div>
                        <CardDescription>
                            流量是整个周期的总额度，不按月重置。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div
                            role="meter"
                            aria-label="已用流量比例"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(percent)}
                            className="h-2 w-full overflow-hidden rounded-full bg-muted"
                        >
                            <div
                                className={cn(
                                    "h-full rounded-full transition-[width]",
                                    percent >= 100
                                        ? "bg-destructive"
                                        : percent >= 90
                                          ? "bg-amber-500"
                                          : "bg-primary",
                                )}
                                style={{ width: `${Math.min(100, percent)}%` }}
                            />
                        </div>
                        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                            {[
                                ["已用", formatTraffic(used)],
                                ["上传", formatTraffic(data.uploadBytes)],
                                ["下载", formatTraffic(data.downloadBytes)],
                                ["周期总额", formatTraffic(data.transferBytes)],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="numeric mt-1 font-medium">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Megaphone className="size-4" /> 公告
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {notices.data?.length ? (
                            <ul className="space-y-4">
                                {notices.data.slice(0, 4).map((notice) => (
                                    <li key={notice.id}>
                                        <p className="font-medium">
                                            {notice.title}
                                        </p>
                                        <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
                                            {notice.content}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {notices.isPending
                                    ? "正在加载…"
                                    : "暂时没有公告。"}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </Page>
    );
}
