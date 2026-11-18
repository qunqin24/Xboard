import { QRCodeSVG } from "qrcode.react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { RecoveryCodes, TotpSetup } from "@xboard/contracts";
import { useAccount } from "@/api/hooks";
import { useCommand } from "@/api/panel";
import { PasswordInput } from "@/components/password-input";
import { SecretDialog } from "@/components/secret-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tile } from "@/components/ui/tile";

type Action = "setup" | "disable" | "recovery";
const titles: Record<Action, string> = {
    setup: "启用两步验证",
    disable: "关闭两步验证",
    recovery: "重新生成恢复码",
};

export function TwoFactorSettings() {
    const account = useAccount();
    const [action, setAction] = useState<Action | null>(null);
    const [setup, setSetup] = useState<TotpSetup | null>(null);
    const [codes, setCodes] = useState<string[] | null>(null);
    const start = useCommand<TotpSetup>();
    const change = useCommand<RecoveryCodes | { ok: boolean }>();
    const busy = start.isPending || change.isPending;
    const close = () => {
        setAction(null);
        setSetup(null);
    };
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const password = String(data.get("password") ?? "");
        const code = String(data.get("code") ?? "");
        if (action === "setup" && !setup) {
            start.mutate(
                { path: "/account/totp/setup", body: { password } },
                { onSuccess: setSetup },
            );
            return;
        }
        const path =
            action === "setup"
                ? "enable"
                : action === "disable"
                  ? "disable"
                  : "recovery-codes";
        change.mutate(
            {
                path: `/account/totp/${path}`,
                body: setup ? { code } : { password, code },
            },
            {
                onSuccess: (result) => {
                    close();
                    if ("codes" in result) setCodes(result.codes);
                    else toast.success("两步验证已关闭");
                },
            },
        );
    }
    const enabled = account.data?.twoFactorEnabled;
    return (
        <section
            className="flex flex-col gap-group"
            aria-labelledby="two-factor-heading"
        >
            <div className="flex items-center gap-inline">
                <h4 id="two-factor-heading" className="font-semibold">
                    两步验证
                </h4>
                {account.isSuccess && (
                    <Badge variant={enabled ? "success" : "secondary"}>
                        {enabled ? "已启用" : "未启用"}
                    </Badge>
                )}
            </div>
            {account.isSuccess &&
                (enabled ? (
                    <div className="flex flex-wrap gap-inline">
                        <Button
                            variant="outline"
                            onClick={() => setAction("recovery")}
                        >
                            重新生成恢复码
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setAction("disable")}
                        >
                            关闭两步验证
                        </Button>
                    </div>
                ) : (
                    <div>
                        <Button
                            variant="outline"
                            onClick={() => setAction("setup")}
                        >
                            启用两步验证
                        </Button>
                    </div>
                ))}
            <Dialog
                open={action !== null}
                onOpenChange={(open) => !open && !busy && close()}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {action ? titles[action] : ""}
                        </DialogTitle>
                        <DialogDescription>
                            {setup
                                ? "用身份验证器扫描二维码，或手动输入下方密钥，然后填写生成的 6 位动态验证码。"
                                : action === "setup"
                                  ? "启用后，其他设备需使用两步验证重新登录。"
                                  : action === "recovery"
                                    ? "生成后，之前的恢复码会立即失效。"
                                    : "关闭后，登录只需账户密码。"}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        key={setup ? "code" : action}
                        className="flex flex-col gap-group"
                        onSubmit={submit}
                    >
                        {setup ? (
                            <div className="grid gap-field">
                                <div className="flex justify-center">
                                    {/* Scanners need dark modules on a light ground, so the
                                        code keeps light-theme colours in dark mode too. */}
                                    <Tile className="light text-foreground">
                                        <QRCodeSVG
                                            value={setup.uri}
                                            size={168}
                                            bgColor="transparent"
                                            fgColor="currentColor"
                                            level="M"
                                            title="两步验证设置二维码"
                                        />
                                    </Tile>
                                </div>
                                <Label htmlFor="totp-secret">
                                    无法扫码时，手动输入密钥
                                </Label>
                                <Input
                                    id="totp-secret"
                                    readOnly
                                    value={setup.secret}
                                    className="numeric"
                                    onFocus={(event) => event.target.select()}
                                />
                            </div>
                        ) : (
                            <div className="grid gap-field">
                                <Label htmlFor="totp-password">当前密码</Label>
                                <PasswordInput
                                    id="totp-password"
                                    name="password"
                                    required
                                    maxLength={256}
                                    autoComplete="current-password"
                                />
                            </div>
                        )}
                        {(setup || action !== "setup") && (
                            <div className="grid gap-field">
                                <Label htmlFor="totp-code">
                                    {setup
                                        ? "动态验证码"
                                        : "动态验证码或恢复码"}
                                </Label>
                                <Input
                                    id="totp-code"
                                    name="code"
                                    required
                                    maxLength={19}
                                    autoComplete="one-time-code"
                                    inputMode={setup ? "numeric" : "text"}
                                    pattern={setup ? "[0-9]{6}" : undefined}
                                />
                            </div>
                        )}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={close}
                                disabled={busy}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                disabled={busy}
                                variant={
                                    action === "disable"
                                        ? "destructive"
                                        : "default"
                                }
                            >
                                {setup
                                    ? "确认启用"
                                    : action === "setup"
                                      ? "继续"
                                      : "确认"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <SecretDialog
                title="两步验证恢复码"
                description="恢复码仅显示一次。每个恢复码只能使用一次，请妥善保存。"
                value={codes?.join("\n") ?? null}
                onClose={() => setCodes(null)}
            />
        </section>
    );
}
