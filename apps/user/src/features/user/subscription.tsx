import { Link } from "@tanstack/react-router";
import {
    Check,
    Copy,
    KeyRound,
    Loader2,
    RefreshCw,
    TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "@/api/hooks";
import { useCommand } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

import type { SubscriptionLinks as Links } from "@xboard/contracts";

const CLIENTS: { key: keyof Links; label: string; hint: string }[] = [
    {
        key: "mihomo",
        label: "Mihomo / Clash Meta",
        hint: "Clash Verge Rev、FlClash、Stash 等",
    },
    {
        key: "singbox",
        label: "Sing-box",
        hint: "sing-box、SFA、SFI、Hiddify 等",
    },
];

function CopyField({
    id,
    label,
    value,
}: {
    id: string;
    label: string;
    value: string;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex gap-inline">
            <Input
                id={id}
                readOnly
                value={value}
                aria-label={`${label} 订阅地址`}
                onFocus={(event) => event.target.select()}
                className="numeric text-xs"
            />
            <Button
                variant="outline"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(value);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    } catch {
                        toast.error("无法访问剪贴板，请手动复制。");
                    }
                }}
            >
                {copied ? <Check /> : <Copy />}
                {copied ? "已复制" : "复制"}
            </Button>
        </div>
    );
}

export function Subscription() {
    const account = useAccount();
    const generate = useCommand();
    const rotate = useCommand();
    const [confirming, setConfirming] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [links, setLinks] = useState<Links | null>(null);
    const hasPlan = Boolean(account.data?.plan);

    return (
        <Page title="订阅链接">
            {account.isError ? (
                <ErrorState
                    error={account.error}
                    onRetry={() => void account.refetch()}
                />
            ) : account.isPending ? (
                <Skeleton className="h-48 max-w-3xl" />
            ) : !hasPlan ? (
                <Card className="max-w-3xl">
                    <EmptyState
                        title="未开通套餐"
                        description="开通套餐后可生成订阅链接。"
                        action={
                            <Button asChild>
                                <Link to="/plans">选购套餐</Link>
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <Card className="max-w-3xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-1">
                            生成订阅链接
                            <InfoTip>已导入的节点凭据不变。</InfoTip>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-group">
                        <Button
                            variant={links ? "outline" : "default"}
                            disabled={generate.isPending}
                            onClick={() => setConfirming(true)}
                        >
                            {generate.isPending ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <RefreshCw />
                            )}
                            {links ? "重新生成" : "生成订阅链接"}
                        </Button>
                        {links ? (
                            <Alert variant="warning">
                                <TriangleAlert />
                                <AlertDescription>
                                    链接只显示一次，请妥善保存。
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        {links
                            ? CLIENTS.map((client) => (
                                  <div
                                      key={client.key}
                                      className="space-y-field"
                                  >
                                      <Label
                                          htmlFor={`sub-${client.key}`}
                                          className="flex-wrap gap-x-inline"
                                      >
                                          <span>{client.label}</span>
                                          <span className="font-normal text-muted-foreground">
                                              {client.hint}
                                          </span>
                                      </Label>
                                      <CopyField
                                          id={`sub-${client.key}`}
                                          label={client.label}
                                          value={links[client.key]}
                                      />
                                  </div>
                              ))
                            : null}
                    </CardContent>
                </Card>
            )}
            {hasPlan ? (
                <Card className="max-w-3xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-1">
                            节点凭据
                            <InfoTip>
                                客户端配置泄露时更换。订阅链接不变，旧凭据在节点下次同步后失效。
                            </InfoTip>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="destructive"
                            disabled={rotate.isPending}
                            onClick={() => setRotating(true)}
                        >
                            {rotate.isPending ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <KeyRound />
                            )}
                            更换节点凭据
                        </Button>
                    </CardContent>
                </Card>
            ) : null}
            <ConfirmDialog
                open={rotating}
                onOpenChange={setRotating}
                title="更换节点凭据？"
                desc="所有已导入的客户端都需要重新更新订阅后才能连接。"
                confirmText="更换"
                destructive
                isLoading={rotate.isPending}
                handleConfirm={() =>
                    rotate.mutate(
                        { path: "/account/credentials" },
                        {
                            onSuccess: () => {
                                toast.success(
                                    "节点凭据已更换，请在客户端更新订阅",
                                );
                                setRotating(false);
                            },
                        },
                    )
                }
            />
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={links ? "重新生成订阅链接？" : "生成新的订阅链接？"}
                desc="旧订阅链接将立即失效，客户端须改用新链接更新节点。"
                confirmText="生成"
                destructive
                isLoading={generate.isPending}
                handleConfirm={() =>
                    generate.mutate(
                        { path: "/account/subscription" },
                        {
                            onSuccess: (result) => {
                                setLinks(result as unknown as Links);
                                setConfirming(false);
                            },
                        },
                    )
                }
            />
        </Page>
    );
}
