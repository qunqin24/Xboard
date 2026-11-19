import { useState, type FormEvent } from "react";
import type { AdminGateway, PaymentReceipt } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { ErrorState } from "@/components/error-state";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime, formatMinor } from "@/lib/format";
import { serverErrorMessage } from "@/lib/handle-server-error";

function GatewayEditor({
    current,
    onDone,
}: {
    current?: AdminGateway;
    onDone: () => void;
}) {
    const [kind, setKind] = useState<AdminGateway["kind"]>(
        current?.kind ?? "stripe",
    );
    const save = useCommand<AdminGateway>({ inline: true });
    const epay =
        current?.config && "apiUrl" in current.config
            ? current.config
            : undefined;
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const str = (key: string) => String(form.get(key) ?? "").trim();
        const secret = str("secret");
        const webhook = str("webhook");
        const body = {
            kind,
            name: str("name"),
            enabled: form.has("enabled"),
            icon: str("icon") || null,
            sortOrder: Number(str("sortOrder")),
            feePercentBasisPoints: Number(str("feePercentBasisPoints")),
            feeFixedMinor: Number(str("feeFixedMinor")),
            config:
                kind === "epay"
                    ? {
                          apiUrl: str("apiUrl"),
                          pid: str("pid"),
                          payType: str("payType"),
                      }
                    : {},
            ...(secret || webhook
                ? {
                      secrets:
                          kind === "epay"
                              ? { key: secret }
                              : { secretKey: secret, webhookSecret: webhook },
                  }
                : {}),
        };
        save.mutate(
            {
                path: current
                    ? `/admin/payment-gateways/${current.id}`
                    : "/admin/payment-gateways",
                method: current ? "PUT" : "POST",
                body,
                related: ["/admin/payment-gateways"],
            },
            { onSuccess: onDone },
        );
    };
    const fields = [
        ["name", "显示名称", current?.name, "text"],
        ["icon", "图标 URL", current?.icon, "url"],
        ["sortOrder", "排序", current?.sortOrder ?? 0, "number"],
        [
            "feePercentBasisPoints",
            "费率（万分比）",
            current?.feePercentBasisPoints ?? 0,
            "number",
        ],
        [
            "feeFixedMinor",
            "固定手续费（分）",
            current?.feeFixedMinor ?? 0,
            "number",
        ],
        ...(kind === "epay"
            ? [
                  ["apiUrl", "网关地址", epay?.apiUrl, "url"],
                  ["pid", "商户号", epay?.pid, "text"],
              ]
            : []),
    ] as const;
    return (
        <form
            className="space-y-group rounded-card border p-group"
            onSubmit={submit}
        >
            <div className="grid gap-group sm:grid-cols-2">
                <div className="grid gap-field">
                    <Label htmlFor="gateway-kind">网关类型</Label>
                    <select
                        id="gateway-kind"
                        className="h-9 rounded-control border bg-background px-field"
                        value={kind}
                        disabled={!!current}
                        onChange={(event) =>
                            setKind(event.target.value as AdminGateway["kind"])
                        }
                    >
                        <option value="stripe">Stripe</option>
                        <option value="epay">易支付</option>
                    </select>
                </div>
                {fields.map(([field, label, value, type]) => (
                    <div key={field} className="grid gap-field">
                        <Label htmlFor={`gateway-${field}`}>{label}</Label>
                        <Input
                            id={`gateway-${field}`}
                            name={field}
                            type={type}
                            defaultValue={value ?? ""}
                            min={type === "number" ? 0 : undefined}
                            required={field !== "icon"}
                        />
                    </div>
                ))}
                {kind === "epay" ? (
                    <div className="grid gap-field">
                        <Label htmlFor="gateway-pay-type">收款方式</Label>
                        <select
                            id="gateway-pay-type"
                            name="payType"
                            className="h-9 rounded-control border bg-background px-field"
                            defaultValue={epay?.payType ?? ""}
                        >
                            <option value="">由收银台选择</option>
                            <option value="alipay">支付宝</option>
                            <option value="wxpay">微信支付</option>
                        </select>
                    </div>
                ) : null}
                <div className="grid gap-field">
                    <Label htmlFor="gateway-secret">
                        {kind === "epay" ? "商户密钥" : "Stripe API 密钥"}
                    </Label>
                    <Input
                        id="gateway-secret"
                        name="secret"
                        type="password"
                        autoComplete="new-password"
                        required={!current}
                        placeholder={current?.configured ? "已设置" : undefined}
                    />
                </div>
                {kind === "stripe" ? (
                    <div className="grid gap-field">
                        <Label htmlFor="gateway-webhook">
                            Webhook 签名密钥
                        </Label>
                        <Input
                            id="gateway-webhook"
                            name="webhook"
                            type="password"
                            autoComplete="new-password"
                            required={!current}
                            placeholder={
                                current?.configured ? "已设置" : undefined
                            }
                        />
                    </div>
                ) : null}
            </div>
            <Label>
                <Input
                    type="checkbox"
                    name="enabled"
                    className="size-4"
                    defaultChecked={current?.enabled ?? false}
                />
                启用
            </Label>
            {current && kind === "stripe" ? (
                <p className="break-all text-sm text-muted-foreground">
                    Webhook 地址 {window.location.origin}
                    /api/payments/webhooks/stripe/{current.id}
                </p>
            ) : null}
            {save.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {serverErrorMessage(save.error)}
                </p>
            ) : null}
            <div className="flex gap-inline">
                <LoadingButton type="submit" loading={save.isPending}>
                    保存网关
                </LoadingButton>
                <Button type="button" variant="outline" onClick={onDone}>
                    取消
                </Button>
            </div>
        </form>
    );
}

const receiptStates = {
    settled: "已结算",
    credited: "已入余额",
    review: "待人工处理",
    pending: "待支付",
};
export function PaymentSettings() {
    const gateways = usePanel<AdminGateway[]>("/admin/payment-gateways");
    const receipts = usePanel<PaymentReceipt[]>("/admin/payment-receipts");
    const [editing, setEditing] = useState<AdminGateway | "new" | null>(null);
    return (
        <Card className="max-w-3xl">
            <CardHeader>
                <CardTitle>在线支付</CardTitle>
            </CardHeader>
            <CardContent className="space-y-group">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing("new")}
                >
                    新增网关
                </Button>
                {gateways.error ? (
                    <ErrorState
                        error={gateways.error}
                        onRetry={() => gateways.refetch()}
                    />
                ) : null}
                {gateways.data?.map((gateway) => (
                    <div
                        key={gateway.id}
                        className="flex items-center justify-between gap-group border-b pb-field"
                    >
                        <span>
                            {gateway.name} ·{" "}
                            {gateway.enabled ? "已启用" : "已停用"}
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(gateway)}
                        >
                            编辑
                        </Button>
                    </div>
                ))}
                {editing ? (
                    <GatewayEditor
                        key={editing === "new" ? "new" : editing.id}
                        current={editing === "new" ? undefined : editing}
                        onDone={() => setEditing(null)}
                    />
                ) : null}
                <h3 className="font-medium">最近支付回执</h3>
                {receipts.error ? (
                    <ErrorState
                        error={receipts.error}
                        onRetry={() => receipts.refetch()}
                    />
                ) : null}
                {receipts.data?.length ? (
                    <ul className="space-y-field text-sm">
                        {receipts.data.map((receipt) => (
                            <li
                                key={receipt.id}
                                className="break-all border-b pb-field"
                            >
                                {receiptStates[receipt.status]} ·{" "}
                                {formatMinor(receipt.amountMinor)} ·{" "}
                                {receipt.receivedAt
                                    ? formatDateTime(receipt.receivedAt)
                                    : ""}
                                <div className="text-muted-foreground">
                                    {receipt.externalId}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        暂无支付回执
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
