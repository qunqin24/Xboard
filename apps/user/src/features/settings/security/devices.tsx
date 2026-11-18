import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import type { DeviceSession } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { IconBlock } from "@/components/ui/icon-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tile } from "@/components/ui/tile";
import { formatDateTime } from "@/lib/format";

export function LoginDevices() {
    const sessions = usePanel<DeviceSession[]>("/account/sessions");
    const revoke = useCommand();
    const [selected, setSelected] = useState<DeviceSession | "others" | null>(
        null,
    );
    return (
        <section
            className="flex flex-col gap-group"
            aria-labelledby="devices-heading"
        >
            <div className="flex flex-wrap items-center justify-between gap-inline">
                <h4 id="devices-heading" className="font-semibold">
                    登录设备
                </h4>
                {!!sessions.data?.some((device) => !device.current) && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected("others")}
                    >
                        下线其他设备
                    </Button>
                )}
            </div>
            {sessions.isPending ? (
                <Skeleton className="h-24" />
            ) : sessions.isError ? (
                <ErrorState
                    error={sessions.error}
                    onRetry={() => void sessions.refetch()}
                />
            ) : (
                sessions.data.map((device) => (
                    <Tile key={device.id} className="flex-wrap">
                        <IconBlock>
                            <MonitorSmartphone />
                        </IconBlock>
                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm break-all">
                                {device.userAgent || "未知设备"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                登录于 {formatDateTime(device.createdAt)}
                            </p>
                        </div>
                        {device.current ? (
                            <Badge variant="success">当前设备</Badge>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelected(device)}
                            >
                                下线
                            </Button>
                        )}
                    </Tile>
                ))
            )}
            <ConfirmDialog
                open={selected !== null}
                onOpenChange={(open) => !open && setSelected(null)}
                title={selected === "others" ? "下线其他设备" : "下线该设备"}
                desc={
                    selected === "others"
                        ? "除当前登录外，其他设备需重新登录。"
                        : "该设备需重新登录。"
                }
                confirmText="下线"
                destructive
                isLoading={revoke.isPending}
                handleConfirm={() =>
                    selected &&
                    revoke.mutate(
                        selected === "others"
                            ? { path: "/account/sessions/revoke-others" }
                            : {
                                  path: `/account/sessions/${selected.id}`,
                                  method: "DELETE",
                              },
                        {
                            onSuccess: () => {
                                setSelected(null);
                                toast.success("登录设备已下线");
                            },
                        },
                    )
                }
            />
        </section>
    );
}
