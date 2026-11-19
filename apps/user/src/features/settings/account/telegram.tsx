import { useState } from "react";
import type { TelegramAccount, TelegramLink } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { serverErrorMessage } from "@/lib/handle-server-error";

export function TelegramAccountSettings() {
    const settings = usePanel<TelegramAccount>("/account/telegram", {
        refetchInterval: (result) =>
            result?.enabled && !result.linked ? 5_000 : false,
    });
    const connect = useCommand<TelegramLink>({ inline: true });
    const disconnect = useCommand({ inline: true });
    const [link, setLink] = useState<TelegramLink | null>(null);
    if (!settings.data?.enabled && !settings.data?.linked) return null;
    return (
        <section
            className="grid gap-field border-t pt-group"
            aria-labelledby="telegram-account"
        >
            <h3 id="telegram-account" className="font-semibold">
                Telegram
            </h3>
            {settings.data.linked ? (
                <div className="flex flex-wrap items-center gap-inline">
                    <p>已绑定</p>
                    <LoadingButton
                        variant="outline"
                        loading={disconnect.isPending}
                        onClick={() =>
                            disconnect.mutate(
                                {
                                    path: "/account/telegram",
                                    method: "DELETE",
                                    related: ["/account/telegram"],
                                },
                                { onSuccess: () => setLink(null) },
                            )
                        }
                    >
                        解除绑定
                    </LoadingButton>
                </div>
            ) : (
                <div className="grid justify-items-start gap-field">
                    <LoadingButton
                        variant="outline"
                        loading={connect.isPending}
                        onClick={() =>
                            connect.mutate(
                                { path: "/account/telegram/link" },
                                { onSuccess: (value) => setLink(value) },
                            )
                        }
                    >
                        生成绑定链接
                    </LoadingButton>
                    {link ? (
                        <>
                            <Button asChild>
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    在 Telegram 中打开
                                </a>
                            </Button>
                            <p className="text-sm text-muted-foreground">
                                点击机器人的「开始」完成绑定。链接有效至{" "}
                                {formatDateTime(link.expiresAt)}。
                            </p>
                        </>
                    ) : null}
                </div>
            )}
            {connect.error || disconnect.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {serverErrorMessage(connect.error ?? disconnect.error)}
                </p>
            ) : null}
        </section>
    );
}
