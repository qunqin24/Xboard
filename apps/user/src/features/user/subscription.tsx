import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { SubscriptionLinks } from "@xboard/contracts";
import {
    Check,
    Copy,
    Download,
    KeyRound,
    Link2Off,
    Loader2,
    Package,
    QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useAccount } from "@/api/hooks";
import { useCommand, usePanel, useSite } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { IconBlock } from "@/components/ui/icon-block";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tile } from "@/components/ui/tile";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate } from "@/lib/format";
import {
    clientsFor,
    detectPlatform,
    PLATFORMS,
    recommendedClient,
    type Platform,
} from "./clients";

export function Subscription() {
    const account = useAccount();
    const plan = account.data?.plan;
    // Created on the first visit and the same every time after, until reset.
    const links = usePanel<SubscriptionLinks>("/account/subscription", {
        enabled: Boolean(plan),
    });

    return (
        <Page
            title="订阅链接"
            description={
                plan && account.data
                    ? `${plan.name} · ${
                          account.data.expiredAt === null
                              ? "长期有效"
                              : `${formatDate(account.data.expiredAt)} 到期`
                      }`
                    : undefined
            }
        >
            {account.isError ? (
                <ErrorState
                    error={account.error}
                    onRetry={() => void account.refetch()}
                />
            ) : account.isPending ? (
                <div className="grid gap-page lg:grid-cols-3">
                    <Skeleton shape="card" className="h-96 lg:col-span-2" />
                    <Skeleton shape="card" className="h-96" />
                </div>
            ) : !plan ? (
                <Card>
                    <EmptyState
                        icon={Package}
                        title="未开通套餐"
                        description="开通套餐后可获取订阅链接。"
                        action={
                            <Button asChild>
                                <Link to="/plans">选购套餐</Link>
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="grid items-start gap-page lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-1">
                                通用订阅链接
                                <InfoTip>
                                    同一个链接适用于所有客户端，导入时自动识别
                                    Mihomo 或 sing-box 格式。
                                </InfoTip>
                            </CardTitle>
                            <CardDescription>
                                复制链接，或在下方一键导入到客户端。
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {links.isError ? (
                                <ErrorState
                                    error={links.error}
                                    onRetry={() => void links.refetch()}
                                />
                            ) : links.data ? (
                                <CopyLink value={links.data.url} />
                            ) : (
                                <Skeleton className="h-9" />
                            )}
                        </CardContent>
                        <CardFooter className="border-t">
                            <ClientPicker links={links.data} />
                        </CardFooter>
                    </Card>
                    <div className="grid gap-page">
                        <QrCard url={links.data?.url} />
                        <SecurityCard ready={Boolean(links.data)} />
                    </div>
                </div>
            )}
        </Page>
    );
}

function CopyLink({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex flex-col gap-field">
            <Label htmlFor="subscription-url" className="sr-only">
                订阅链接
            </Label>
            <div className="flex gap-inline">
                <Input
                    id="subscription-url"
                    readOnly
                    value={value}
                    onFocus={(event) => event.target.select()}
                    className="numeric bg-muted/50 text-xs"
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
        </div>
    );
}

/**
 * Clients for one platform as tiles, the device's own platform first and its
 * suggested app highlighted. Tiles stay visible while the link loads.
 */
function ClientPicker({ links }: { links: SubscriptionLinks | undefined }) {
    const site = useSite();
    const device = useMemo(
        () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
        [],
    );
    const [platform, setPlatform] = useState<Platform>(device);
    const recommended = recommendedClient(platform);
    const clients = [
        recommended,
        ...clientsFor(platform).filter((c) => c.id !== recommended.id),
    ];

    return (
        <div className="flex w-full flex-col gap-group">
            <div className="flex flex-wrap items-center justify-between gap-inline">
                <h3 className="text-sm font-medium">导入到客户端</h3>
                <ToggleGroup
                    type="single"
                    value={platform}
                    onValueChange={(value) => {
                        if (value) setPlatform(value as Platform);
                    }}
                    aria-label="平台"
                    className="w-full sm:w-auto"
                >
                    {PLATFORMS.map((item) => (
                        <ToggleGroupItem
                            key={item.value}
                            value={item.value}
                            // Five platforms fit a 375px phone only with the
                            // tighter padding.
                            className="px-2 sm:px-3"
                        >
                            {item.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>
            <ul className="grid gap-field sm:grid-cols-2">
                {clients.map((client) => {
                    const suggested = client.id === recommended.id;
                    return (
                        <li key={client.id}>
                            <Tile tone={suggested ? "highlight" : "default"}>
                                <IconBlock
                                    tone={suggested ? "brand" : "neutral"}
                                >
                                    {client.name.slice(0, 1).toUpperCase()}
                                </IconBlock>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                        {client.name}
                                    </p>
                                    <div className="mt-1 flex gap-1">
                                        <Badge variant="secondary">
                                            {client.core}
                                        </Badge>
                                        {suggested ? (
                                            <Badge variant="brand">推荐</Badge>
                                        ) : null}
                                    </div>
                                    {client.rulesUrl && links ? (
                                        // Apps that take the rules as a second import.
                                        <a
                                            href={client.rulesUrl(links)}
                                            className="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
                                        >
                                            导入规则
                                        </a>
                                    ) : null}
                                </div>
                                <ImportButton
                                    href={
                                        links &&
                                        client.importUrl(
                                            links,
                                            site.data?.siteName ?? "Xboard",
                                        )
                                    }
                                    primary={suggested}
                                    name={client.name}
                                />
                            </Tile>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function ImportButton({
    href,
    primary,
    name,
    label = "导入",
}: {
    href: string | undefined;
    primary: boolean;
    name: string;
    /** "规则" for the separate rules import (Shadowrocket). */
    label?: string;
}) {
    const variant = primary ? "default" : "outline";
    if (!href)
        return (
            <Button size="sm" variant={variant} disabled>
                {label}
            </Button>
        );
    return (
        <Button size="sm" variant={variant} asChild>
            <a
                href={href}
                aria-label={
                    label === "导入"
                        ? `导入到 ${name}`
                        : `导入${label}到 ${name}`
                }
            >
                {primary ? <Download /> : null}
                {label}
            </a>
        </Button>
    );
}

/** For importing into a phone from a computer; hidden on small screens. */
function QrCard({ url }: { url: string | undefined }) {
    return (
        <Card className="hidden md:flex">
            <CardHeader>
                <CardTitle className="flex items-center gap-inline">
                    <QrCode className="size-4 text-muted-foreground" />
                    扫码导入
                </CardTitle>
                <CardDescription>用手机客户端扫描二维码。</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
                {url ? (
                    // Scanners need dark modules on a light ground, so the
                    // code keeps light-theme colours in dark mode too.
                    <Tile className="light text-foreground">
                        <QRCodeSVG
                            value={url}
                            size={160}
                            bgColor="transparent"
                            fgColor="currentColor"
                            level="M"
                            title="订阅链接二维码"
                        />
                    </Tile>
                ) : (
                    <Skeleton className="size-46" />
                )}
            </CardContent>
        </Card>
    );
}

function SecurityCard({ ready }: { ready: boolean }) {
    const reset = useCommand();
    const rotate = useCommand();
    const [resetting, setResetting] = useState(false);
    const [rotating, setRotating] = useState(false);

    return (
        <Card>
            <CardHeader>
                <CardTitle>安全</CardTitle>
                <CardDescription>链接或配置外泄时使用。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
                <SecurityRow
                    icon={<Link2Off />}
                    title="重置订阅链接"
                    description="旧链接立即失效，节点凭据不变。"
                    action={
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={!ready || reset.isPending}
                            onClick={() => setResetting(true)}
                        >
                            {reset.isPending ? (
                                <Loader2 className="animate-spin" />
                            ) : null}
                            重置
                        </Button>
                    }
                />
                <SecurityRow
                    icon={<KeyRound />}
                    title="更换节点凭据"
                    description="链接不变，已导入的客户端需更新订阅。"
                    action={
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={rotate.isPending}
                            onClick={() => setRotating(true)}
                        >
                            {rotate.isPending ? (
                                <Loader2 className="animate-spin" />
                            ) : null}
                            更换
                        </Button>
                    }
                />
            </CardContent>
            <ConfirmDialog
                open={resetting}
                onOpenChange={setResetting}
                title="重置订阅链接？"
                desc="旧链接立即失效，已导入的客户端需要改用新链接。"
                confirmText="重置"
                destructive
                isLoading={reset.isPending}
                handleConfirm={() =>
                    reset.mutate(
                        { path: "/account/subscription" },
                        {
                            onSuccess: () => {
                                toast.success("订阅链接已重置");
                                setResetting(false);
                            },
                        },
                    )
                }
            />
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
        </Card>
    );
}

function SecurityRow({
    icon,
    title,
    description,
    action,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    action: ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 py-group first:pt-0 last:pb-0">
            <IconBlock tone="neutral" size="sm">
                {icon}
            </IconBlock>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {action}
        </div>
    );
}
