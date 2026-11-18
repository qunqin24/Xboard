import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import type { Invite } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { ContentSection } from "../components/content-section";

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
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    return (
        <div className="flex flex-col gap-field">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex gap-inline">
                <Input
                    id={id}
                    readOnly
                    value={value}
                    onFocus={(event) => event.target.select()}
                    className="numeric bg-muted/50"
                />
                <Button
                    variant="outline"
                    aria-label={`复制${label}`}
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(value);
                            setCopied(true);
                            clearTimeout(timer.current);
                            timer.current = setTimeout(
                                () => setCopied(false),
                                2000,
                            );
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

function InviteDetails({ invite }: { invite: Invite }) {
    const reset = useCommand();
    const [confirming, setConfirming] = useState(false);
    const link = `${window.location.origin}/sign-up?invite=${invite.code}`;
    return (
        <div className="space-y-group">
            <CopyField id="invite-code" label="邀请码" value={invite.code} />
            <CopyField id="invite-link" label="邀请链接" value={link} />
            <div className="flex flex-wrap items-center justify-between gap-group">
                <p className="text-sm">
                    已邀请
                    <span className="numeric mx-1 font-medium">
                        {invite.invitedCount}
                    </span>
                    人
                </p>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirming(true)}
                >
                    <RefreshCw />
                    更换邀请码
                </Button>
            </div>
            {invite.recent.length ? (
                <ul className="divide-y border-y text-sm">
                    {invite.recent.map((row) => (
                        <li
                            key={`${row.email}-${row.createdAt}`}
                            className="flex items-center justify-between gap-group py-3"
                        >
                            <span className="truncate">{row.email}</span>
                            <span className="numeric shrink-0 text-muted-foreground">
                                {formatDateTime(row.createdAt)}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <EmptyState icon={Users} title="暂无邀请记录" />
            )}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                destructive
                title="更换邀请码"
                desc="更换后，旧邀请码和邀请链接将失效，已邀请的用户不受影响。"
                confirmText="更换"
                isLoading={reset.isPending}
                handleConfirm={() =>
                    reset.mutate(
                        { path: "/account/invite/reset" },
                        {
                            onSuccess: () => {
                                setConfirming(false);
                                toast.success("邀请码已更换");
                            },
                        },
                    )
                }
            />
        </div>
    );
}

export function SettingsInvite() {
    const invite = usePanel<Invite>("/account/invite");
    return (
        <ContentSection
            title="邀请"
            help="他人注册时填写你的邀请码或打开邀请链接，即记为你邀请的用户。列表显示最近 20 位。"
        >
            {invite.data ? (
                <InviteDetails invite={invite.data} />
            ) : invite.isError ? (
                <ErrorState
                    error={invite.error}
                    onRetry={() => void invite.refetch()}
                />
            ) : (
                <div className="space-y-group">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-24" />
                </div>
            )}
        </ContentSection>
    );
}
