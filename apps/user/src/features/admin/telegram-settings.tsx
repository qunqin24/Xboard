import type { TelegramSettings as Model } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serverErrorMessage } from "@/lib/handle-server-error";
import { SettingsCard } from "./settings-card";
import { useState } from "react";

export function TelegramSettings() {
    const settings = usePanel<Model>("/admin/settings/telegram");
    const save = useCommand<Model>({ inline: true });
    const [clearing, setClearing] = useState(false);
    const path = "/admin/settings/telegram";
    return (
        <SettingsCard
            title="Telegram 机器人"
            description="管理员绑定账户后，将收到新工单、新订单和节点离线通知。"
        >
            {settings.error ? (
                <ErrorState
                    error={settings.error}
                    onRetry={() => settings.refetch()}
                />
            ) : null}
            {settings.data?.username ? (
                <p>已连接 @{settings.data.username}</p>
            ) : null}
            <form
                className="grid gap-field"
                onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    save.mutate(
                        {
                            path,
                            method: "PUT",
                            body: {
                                telegramBotToken: new FormData(form).get(
                                    "token",
                                ),
                            },
                        },
                        { onSuccess: () => form.reset() },
                    );
                }}
            >
                <Label htmlFor="telegram-token">机器人令牌</Label>
                <Input
                    id="telegram-token"
                    name="token"
                    type="password"
                    autoComplete="new-password"
                    placeholder={settings.data?.tokenSet ? "已设置" : undefined}
                    required
                />
                <div className="flex flex-wrap gap-inline">
                    <LoadingButton type="submit" loading={save.isPending}>
                        验证并保存
                    </LoadingButton>
                    {settings.data?.tokenSet ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setClearing(true)}
                        >
                            停用机器人
                        </Button>
                    ) : null}
                </div>
            </form>
            {save.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {serverErrorMessage(save.error)}
                </p>
            ) : null}
            <ConfirmDialog
                open={clearing}
                onOpenChange={setClearing}
                title="停用 Telegram 机器人"
                desc="停用后将暂停 Telegram 通知。"
                confirmText="停用"
                destructive
                isLoading={save.isPending}
                handleConfirm={() =>
                    save.mutate(
                        {
                            path,
                            method: "PUT",
                            body: { telegramBotToken: null },
                        },
                        { onSuccess: () => setClearing(false) },
                    )
                }
            />
        </SettingsCard>
    );
}
