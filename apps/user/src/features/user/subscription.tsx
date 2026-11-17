import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "@/api/hooks";
import { useCommand } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Page } from "@/components/layout/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Links = { mihomo: string; singbox: string };

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

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex gap-2">
            <Input
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
    const [confirming, setConfirming] = useState(false);
    const [links, setLinks] = useState<Links | null>(null);
    const hasPlan = Boolean(account.data?.plan);

    return (
        <Page title="订阅链接" description="把订阅链接导入客户端即可使用节点。">
            {!hasPlan ? (
                <Alert>
                    <AlertTitle>还没有开通套餐</AlertTitle>
                    <AlertDescription>
                        开通套餐后才能生成订阅链接。
                    </AlertDescription>
                </Alert>
            ) : null}
            <Card className="max-w-3xl">
                <CardHeader>
                    <CardTitle>生成订阅链接</CardTitle>
                    <CardDescription>
                        每次生成都会让之前的链接立即失效，客户端需要改用新链接才能更新节点；已导入的节点凭据不变。链接只显示一次，请妥善保存。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Button
                        disabled={!hasPlan || generate.isPending}
                        onClick={() => setConfirming(true)}
                    >
                        <RefreshCw
                            className={
                                generate.isPending ? "animate-spin" : undefined
                            }
                        />
                        {links ? "重新生成" : "生成订阅链接"}
                    </Button>
                    {links
                        ? CLIENTS.map((client) => (
                              <div key={client.key} className="space-y-1.5">
                                  <p className="text-sm">
                                      <span className="font-medium">
                                          {client.label}
                                      </span>
                                      <span className="ms-2 text-muted-foreground">
                                          {client.hint}
                                      </span>
                                  </p>
                                  <CopyField
                                      label={client.label}
                                      value={links[client.key]}
                                  />
                              </div>
                          ))
                        : null}
                </CardContent>
            </Card>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={links ? "重新生成订阅链接？" : "生成新的订阅链接？"}
                desc="之前的订阅链接会立即失效，客户端需要改用新链接才能更新节点。"
                confirmText="生成"
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
