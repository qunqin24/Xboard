import { Network, Users } from "lucide-react";
import type { Rankings } from "@xboard/contracts";
import { usePanel } from "@/api/panel";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { IconBlock } from "@/components/ui/icon-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { cn } from "@/lib/utils";
import { formatTraffic } from "@/lib/format";

export function TrafficRankings({ days }: { days: number }) {
    const ranking = usePanel<Rankings>(`/admin/rankings?days=${days}`, {
        keepPrevious: true,
    });
    const refreshing = useDelayedFlag(ranking.isPlaceholderData);
    if (ranking.isError)
        return (
            <Card>
                <ErrorState
                    error={ranking.error}
                    onRetry={() => ranking.refetch()}
                />
            </Card>
        );
    return (
        <div className="grid gap-page lg:grid-cols-2">
            {(
                [
                    ["users", "用户流量排行", Users],
                    ["nodes", "节点流量排行", Network],
                ] as const
            ).map(([key, label, Icon]) => (
                <Card key={key} className="min-w-0">
                    <CardHeader>
                        <div className="flex items-center gap-group">
                            <IconBlock>
                                <Icon />
                            </IconBlock>
                            <CardTitle>{label}</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent
                        aria-busy={refreshing}
                        className={cn(
                            "transition-opacity duration-200",
                            refreshing && "opacity-60",
                        )}
                    >
                        {ranking.isPending ? (
                            <Skeleton className="h-32" />
                        ) : ranking.data[key].length ? (
                            <ol className="flex flex-col gap-group">
                                {ranking.data[key].map((item) => (
                                    <li
                                        key={item.id}
                                        className="flex items-baseline justify-between gap-group text-sm"
                                    >
                                        <span className="min-w-0 wrap-anywhere">
                                            {item.name}
                                        </span>
                                        <span className="numeric shrink-0">
                                            {formatTraffic(item.trafficBytes)}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <EmptyState title="暂无流量记录" />
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
