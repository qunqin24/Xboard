import { useState, type FormEvent } from "react";
import type {
    AdminWithdrawal,
    commissionSettingsBody,
} from "@xboard/contracts";
import type { z } from "zod";
import { useCommand, usePanel } from "@/api/panel";
import { ErrorState } from "@/components/error-state";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor } from "@/lib/format";
import { serverErrorMessage } from "@/lib/handle-server-error";
import { SettingsCard } from "./settings-card";

type Settings = z.output<typeof commissionSettingsBody>;
function CommissionForm({ settings }: { settings: Settings }) {
    const save = useCommand({ inline: true });
    return (
        <form
            className="grid gap-group"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                save.mutate({
                    path: "/admin/settings/commission",
                    method: "PUT",
                    body: {
                        commissionEnabled: form.has("commissionEnabled"),
                        commissionFirstOrderOnly: form.has(
                            "commissionFirstOrderOnly",
                        ),
                        withdrawEnabled: form.has("withdrawEnabled"),
                        commissionRateBasisPoints: Number(
                            form.get("commissionRateBasisPoints"),
                        ),
                        withdrawMinMinor: Number(form.get("withdrawMinMinor")),
                        withdrawMethods: String(form.get("withdrawMethods"))
                            .split(/[,，]/)
                            .map((name) => name.trim())
                            .filter(Boolean),
                    },
                });
            }}
        >
            <Label>
                <Input
                    type="checkbox"
                    name="commissionEnabled"
                    className="size-4"
                    defaultChecked={settings.commissionEnabled}
                />
                启用邀请佣金
            </Label>
            <Label>
                <Input
                    type="checkbox"
                    name="commissionFirstOrderOnly"
                    className="size-4"
                    defaultChecked={settings.commissionFirstOrderOnly}
                />
                仅首笔实付订单返佣
            </Label>
            <div className="grid gap-field">
                <Label htmlFor="commission-rate">返佣比例（万分比）</Label>
                <Input
                    id="commission-rate"
                    type="number"
                    name="commissionRateBasisPoints"
                    min={0}
                    max={10000}
                    defaultValue={settings.commissionRateBasisPoints}
                    required
                />
            </div>
            <Label>
                <Input
                    type="checkbox"
                    name="withdrawEnabled"
                    className="size-4"
                    defaultChecked={settings.withdrawEnabled}
                />
                开放提现
            </Label>
            <div className="grid gap-field">
                <Label htmlFor="withdraw-min">最低提现金额（分）</Label>
                <Input
                    id="withdraw-min"
                    type="number"
                    name="withdrawMinMinor"
                    min={1}
                    defaultValue={settings.withdrawMinMinor}
                    required
                />
            </div>
            <div className="grid gap-field">
                <Label htmlFor="withdraw-methods">收款方式（用逗号分隔）</Label>
                <Input
                    id="withdraw-methods"
                    name="withdrawMethods"
                    defaultValue={settings.withdrawMethods.join(", ")}
                />
            </div>
            {save.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {serverErrorMessage(save.error)}
                </p>
            ) : null}
            <LoadingButton
                type="submit"
                className="justify-self-start"
                loading={save.isPending}
            >
                保存
            </LoadingButton>
        </form>
    );
}
const labels = { pending: "待审核", paid: "已付款", rejected: "已驳回" };
function WithdrawalRow({ row }: { row: AdminWithdrawal }) {
    const reveal = useCommand<{ recipient: string }>({ inline: true });
    const review = useCommand({ inline: true });
    const [recipient, setRecipient] = useState<string | null>(null);
    return (
        <li className="space-y-field border-b pb-group">
            <p className="break-words">
                {row.email} · {row.method} · {formatMinor(row.amountMinor)} ·{" "}
                {labels[row.status]}
            </p>
            {row.status === "pending" ? (
                <>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            if (recipient) {
                                setRecipient(null);
                                reveal.reset();
                            } else
                                reveal.mutate(
                                    {
                                        path: `/admin/withdrawals/${row.id}/recipient`,
                                    },
                                    {
                                        onSuccess: (value) => {
                                            setRecipient(value.recipient);
                                            reveal.reset();
                                        },
                                    },
                                );
                        }}
                    >
                        {recipient ? "收起收款信息" : "查看收款信息"}
                    </Button>
                    {recipient ? (
                        <p className="break-all rounded-control bg-muted p-field">
                            {recipient}
                        </p>
                    ) : null}
                    <form
                        className="grid grid-cols-1 gap-field sm:grid-cols-[1fr_auto]"
                        onSubmit={(event: FormEvent<HTMLFormElement>) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            review.mutate(
                                {
                                    path: `/admin/withdrawals/${row.id}`,
                                    method: "PUT",
                                    body: {
                                        status: form.get("status"),
                                        reason: form.get("reason"),
                                    },
                                    related: ["/admin/withdrawals"],
                                },
                                { onSuccess: () => setRecipient(null) },
                            );
                        }}
                    >
                        <Label htmlFor={`withdraw-review-${row.id}`}>
                            审核结果
                        </Label>
                        <select
                            id={`withdraw-review-${row.id}`}
                            name="status"
                            className="h-9 rounded-control border bg-background px-field"
                        >
                            <option value="rejected">驳回并退回佣金</option>
                            <option value="paid">确认已完成线下付款</option>
                        </select>
                        <Input
                            name="reason"
                            aria-label="审核说明"
                            placeholder="审核说明"
                            maxLength={300}
                            required
                        />
                        <LoadingButton
                            type="submit"
                            variant="outline"
                            loading={review.isPending}
                        >
                            提交审核
                        </LoadingButton>
                    </form>
                </>
            ) : row.reason ? (
                <p className="break-words text-sm text-muted-foreground">
                    {row.reason}
                </p>
            ) : null}
            {review.error || reveal.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {serverErrorMessage(review.error ?? reveal.error)}
                </p>
            ) : null}
        </li>
    );
}
export function CommissionSettings() {
    const settings = usePanel<Settings>("/admin/settings/commission");
    const requests = usePanel<AdminWithdrawal[]>("/admin/withdrawals");
    return (
        <>
            <SettingsCard
                title="佣金规则"
                description="返佣比例、提现开关和收款方式。"
            >
                {settings.data ? (
                    <CommissionForm settings={settings.data} />
                ) : settings.error ? (
                    <ErrorState
                        error={settings.error}
                        onRetry={() => settings.refetch()}
                    />
                ) : null}
            </SettingsCard>
            <SettingsCard
                title="提现审核"
                description="确认已线下付款后再标记为已付款；驳回会退回佣金。"
            >
                {requests.error ? (
                    <ErrorState
                        error={requests.error}
                        onRetry={() => requests.refetch()}
                    />
                ) : null}
                {requests.data?.length ? (
                    <ul className="space-y-group">
                        {requests.data.map((row) => (
                            <WithdrawalRow key={row.id} row={row} />
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        暂无提现申请
                    </p>
                )}
            </SettingsCard>
        </>
    );
}
