import type { VersionInfo } from "@xboard/contracts";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ArrowUpCircle,
    CircleCheck,
    ExternalLink,
    GitCommitHorizontal,
    History,
    PackageCheck,
    RefreshCw,
    TriangleAlert,
    type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { request } from "@/api/client";
import { usePanel } from "@/api/panel";
import { ErrorState } from "@/components/error-state";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { IconBlock } from "@/components/ui/icon-block";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { SettingsCard } from "./settings-card";

const VERSION_PATH = "/admin/version";

/** The running version and the newest release (cached by the server for an hour). */
export function useVersion() {
    return usePanel<VersionInfo>(VERSION_PATH);
}

/** Ask GitHub now instead of using the cached answer. */
function useCheckNow() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: () => request<VersionInfo>(`${VERSION_PATH}?refresh=1`),
        onSuccess: (info) => client.setQueryData(["panel", VERSION_PATH], info),
    });
}

const label = (version: string) =>
    /^\d/.test(version) ? `v${version}` : version;

function Fact({
    icon: Icon,
    title,
    value,
    hint,
}: {
    icon: LucideIcon;
    title: string;
    value: ReactNode;
    hint?: ReactNode;
}) {
    return (
        <div className="flex items-center gap-3">
            <IconBlock tone="neutral">
                <Icon />
            </IconBlock>
            <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{title}</dt>
                <dd className="numeric truncate text-sm font-medium">
                    {value}
                </dd>
                {hint ? (
                    <dd className="numeric truncate text-xs text-muted-foreground">
                        {hint}
                    </dd>
                ) : null}
            </div>
        </div>
    );
}

function Status({ info }: { info: VersionInfo }) {
    if (!info.checkEnabled)
        return (
            <p className="text-sm text-muted-foreground">
                检查更新已关闭（环境变量 APP_UPDATE_REPO 为空）。
            </p>
        );
    if (info.error)
        return (
            <Alert variant="warning">
                <TriangleAlert />
                <AlertDescription>{info.error}</AlertDescription>
            </Alert>
        );
    if (info.updateAvailable && info.latest)
        return (
            <Alert variant="info">
                <ArrowUpCircle />
                <AlertTitle>{`发现新版本 ${label(info.latest.version)}`}</AlertTitle>
                <AlertDescription className="space-y-field">
                    <p>
                        先备份数据库，再把 ops/.env 里的 XBOARD_IMAGE
                        改成新版本号，然后拉取镜像并重启。数据库迁移会在启动时自动执行。
                    </p>
                    <Button asChild size="sm" variant="outline">
                        <a
                            href={info.latest.url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            查看更新说明
                            <ExternalLink />
                        </a>
                    </Button>
                </AlertDescription>
            </Alert>
        );
    if (info.updateAvailable === false && info.latest)
        return (
            <Alert variant="success">
                <CircleCheck />
                <AlertDescription>已是最新版本。</AlertDescription>
            </Alert>
        );
    if (info.updateAvailable === false)
        return (
            <p className="text-sm text-muted-foreground">
                暂无正式发布的版本。
            </p>
        );
    return (
        <p className="text-sm text-muted-foreground">
            当前是开发版本，不和正式版本比较。生产环境请使用带版本号的镜像。
        </p>
    );
}

/** Settings → 关于: the running version and a manual update check. */
export function VersionSettings() {
    const version = useVersion();
    const check = useCheckNow();
    const info = check.data ?? version.data;
    return (
        <SettingsCard
            title="版本与更新"
            description="每小时向 GitHub 查询一次最新的正式版本。"
        >
            {version.error && !info ? (
                <ErrorState
                    error={version.error}
                    onRetry={() => version.refetch()}
                />
            ) : !info ? (
                <Skeleton className="h-32 rounded-surface" />
            ) : (
                <>
                    <dl className="grid grid-cols-1 gap-group sm:grid-cols-3">
                        <Fact
                            icon={PackageCheck}
                            title="当前版本"
                            value={label(info.current)}
                            hint={
                                info.commit ? (
                                    <span className="inline-flex items-center gap-1">
                                        <GitCommitHorizontal className="size-3" />
                                        {info.commit.slice(0, 7)}
                                    </span>
                                ) : undefined
                            }
                        />
                        <Fact
                            icon={ArrowUpCircle}
                            title="最新版本"
                            value={
                                info.latest ? label(info.latest.version) : "—"
                            }
                            hint={
                                info.latest
                                    ? `发布于 ${formatDateTime(info.latest.publishedAt)}`
                                    : undefined
                            }
                        />
                        <Fact
                            icon={History}
                            title="上次检查"
                            value={formatDateTime(info.checkedAt)}
                        />
                    </dl>
                    <Status info={info} />
                    {info.checkEnabled ? (
                        <div className="flex flex-wrap items-center gap-inline border-t pt-group">
                            <LoadingButton
                                type="button"
                                variant="outline"
                                loading={check.isPending}
                                icon={<RefreshCw />}
                                onClick={() => check.mutate()}
                            >
                                检查更新
                            </LoadingButton>
                            {check.error ? (
                                <span className="text-sm text-destructive">
                                    检查失败，请稍后重试。
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </>
            )}
        </SettingsCard>
    );
}

/** A dashboard notice while a newer release is out. */
export function UpdateNotice() {
    const version = useVersion();
    const info = version.data;
    if (!info?.updateAvailable || !info.latest) return null;
    return (
        <Alert variant="info">
            <ArrowUpCircle />
            <AlertTitle>{`发现新版本 ${label(info.latest.version)}`}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-inline">
                <span>{`当前运行 ${label(info.current)}。`}</span>
                <Link
                    to="/admin/settings"
                    search={{ section: "about" }}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                >
                    查看升级方法
                </Link>
            </AlertDescription>
        </Alert>
    );
}
