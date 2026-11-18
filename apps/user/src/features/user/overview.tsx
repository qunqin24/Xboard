import { Link } from "@tanstack/react-router";
import { Gauge, Link2, Megaphone, Package, Wallet, Zap } from "lucide-react";
import { useAccount } from "@/api/hooks";
import { usePanel } from "@/api/panel";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { InfoTip } from "@/components/info-tip";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
    daysLeft,
    formatMinor,
    formatTraffic,
    remainingBytes,
    sumBytes,
    usedPercent,
} from "@/lib/format";
import { subscriptionStatus } from "./status";

function Stat({
    title,
    icon: Icon,
    value,
    hint,
    tip,
}: {
    title: string;
    icon: React.ElementType;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tip?: React.ReactNode;
}) {
    return (
        <Card className="gap-field">
            <CardHeader>
                <CardTitle className="flex items-center gap-1">
                    {title}
                    {tip ? <InfoTip>{tip}</InfoTip> : null}
                </CardTitle>
                <CardAction>
                    <Icon className="size-4 text-muted-foreground" />
                </CardAction>
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
                {account.isError ? (
                    <ErrorState
                        error={account.error}
                        onRetry={() => void account.refetch()}
                    />
                ) : (
                    <>
                        <div className="grid gap-group sm:grid-cols-2 lg:grid-cols-4">
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-28" />
                            ))}
                        </div>
                        <div className="grid gap-group lg:grid-cols-7">
                            <Skeleton className="h-48 lg:col-span-4" />
                            <Skeleton className="h-48 lg:col-span-3" />
                        </div>
                    </>
                )}
            </Page>
        );

    const used = sumBytes(data.uploadBytes, data.downloadBytes);
    const percent = usedPercent(used, data.transferBytes);
    const days = daysLeft(data.expiredAt ?? null);
    const status = subscriptionStatus(data);

    return (
        <Page
            title="总览"
            actions={
                <>
                    <Button asChild variant={data.plan ? "outline" : "default"}>
                        <Link to="/plans">
                            <Package />
                            {data.plan ? "续费" : "选购套餐"}
                        </Link>
                    </Button>
                    {data.plan ? (
                        <Button asChild>
                            <Link to="/subscription">
                                <Link2 />
                                订阅链接
                            </Link>
                        </Button>
                    ) : null}
                </>
            }
        >
            <div className="grid gap-group sm:grid-cols-2 lg:grid-cols-4">
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
                                  ? `剩余 ${days} 天`
                                  : "已到期"
                            : undefined
                    }
                />
                <Stat
                    title="账户余额"
                    icon={Wallet}
                    value={formatMinor(data.balanceMinor)}
                    tip="暂不支持在线充值，请联系管理员入账。"
                />
                <Stat
                    title="限速 / 设备"
                    icon={Zap}
                    value={
                        data.speedLimitMbps
                            ? `${data.speedLimitMbps} Mbps`
                            : "不限速"
                    }
                    hint={
                        data.deviceLimit
                            ? `最多 ${data.deviceLimit} 台设备`
                            : "不限设备数"
                    }
                />
            </div>

            <div className="grid gap-group lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-1">
                            流量用量
                            <InfoTip>
                                流量是整个周期的总额度，不按月重置。
                            </InfoTip>
                        </CardTitle>
                        <CardAction>
                            <Badge variant={status.tone}>{status.label}</Badge>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-group">
                        <Progress
                            aria-label="已用流量比例"
                            value={percent}
                            tone={
                                percent >= 100
                                    ? "danger"
                                    : percent >= 90
                                      ? "warning"
                                      : "default"
                            }
                        />
                        <dl className="grid grid-cols-2 gap-group text-sm">
                            {[
                                ["上传", formatTraffic(data.uploadBytes)],
                                ["下载", formatTraffic(data.downloadBytes)],
                            ].map(([label, value]) => (
                                <div key={label} className="space-y-1">
                                    <dt className="text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="numeric font-medium">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-inline">
                            <Megaphone className="size-4" />
                            公告
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {notices.isPending ? (
                            <div className="space-y-group">
                                <Skeleton className="h-10" />
                                <Skeleton className="h-10" />
                            </div>
                        ) : notices.isError ? (
                            <ErrorState
                                error={notices.error}
                                onRetry={() => void notices.refetch()}
                            />
                        ) : notices.data?.length ? (
                            <ul className="space-y-group">
                                {notices.data.slice(0, 4).map((notice) => (
                                    <li key={notice.id} className="space-y-1">
                                        <p className="font-medium">
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
            </div>
        </Page>
    );
}
