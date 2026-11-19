import { useRef, type FormEvent } from "react";
import type { Commission } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { ErrorState } from "@/components/error-state";
import { LoadingButton } from "@/components/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime, formatMinor } from "@/lib/format";
import { serverErrorMessage } from "@/lib/handle-server-error";

const status = { pending: "待审核", paid: "已付款", rejected: "已驳回" };
const entryLabels = {
    reward: "邀请奖励",
    transfer: "转入余额",
    withdrawal: "提现预留",
    reversal: "提现退回",
    clawback: "换套餐追回",
};

function CommissionAction({
    commission,
    withdraw,
}: {
    commission: Commission;
    withdraw: boolean;
}) {
    const action = useCommand({ inline: true });
    const pending = useRef<{ serialized: string; requestId: string }>(null);
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const amountMinor = Math.round(Number(data.get("amount")) * 100);
        const payload = {
            amountMinor,
            ...(withdraw && {
                method: String(data.get("method")),
                recipient: String(data.get("recipient")),
            }),
        };
        const serialized = JSON.stringify(payload);
        if (pending.current?.serialized !== serialized)
            pending.current = { serialized, requestId: crypto.randomUUID() };
        action.mutate(
            {
                path: withdraw
                    ? "/account/commission/withdrawals"
                    : "/account/commission/transfer",
                body: { ...payload, requestId: pending.current.requestId },
                related: ["/account/commission"],
            },
            {
                onSuccess: () => {
                    form.reset();
                    pending.current = null;
                },
            },
        );
    }
    const key = withdraw ? "withdrawal" : "commission-transfer";
    return (
        <form
            onSubmit={submit}
            className="grid gap-field rounded-card border p-group"
        >
            <Label htmlFor={key}>
                {withdraw ? "提现金额（元）" : "转入余额金额（元）"}
            </Label>
            <Input
                id={key}
                name="amount"
                type="number"
                required
                step="0.01"
                min={withdraw ? commission.withdrawMinMinor / 100 : 0.01}
                max={Math.min(commission.availableMinor / 100, 1_000_000)}
            />
            {withdraw ? (
                <>
                    <Label htmlFor="withdrawal-method">收款方式</Label>
                    <select
                        id="withdrawal-method"
                        name="method"
                        className="h-9 rounded-control border bg-background px-field"
                        required
                    >
                        {commission.methods.map((method) => (
                            <option key={method} value={method}>
                                {method}
                            </option>
                        ))}
                    </select>
                    <Label htmlFor="withdrawal-recipient">收款信息</Label>
                    <Input
                        id="withdrawal-recipient"
                        name="recipient"
                        autoComplete="off"
                        maxLength={600}
                        required
                    />
                </>
            ) : null}
            {action.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {serverErrorMessage(action.error)}
                </p>
            ) : null}
            <LoadingButton
                type="submit"
                variant="outline"
                loading={action.isPending}
            >
                {withdraw ? "申请提现" : "转入余额"}
            </LoadingButton>
        </form>
    );
}

export function CommissionSection() {
    const model = usePanel<Commission>("/account/commission");
    const data = model.data;
    if (model.error)
        return (
            <ErrorState error={model.error} onRetry={() => model.refetch()} />
        );
    if (
        !data ||
        (!data.enabled &&
            !data.availableMinor &&
            !data.entries.length &&
            !data.withdrawals.length)
    )
        return null;
    return (
        <section
            aria-labelledby="commission-title"
            className="space-y-group border-t pt-group"
        >
            <h3 id="commission-title" className="font-semibold">
                邀请佣金
            </h3>
            <p>
                可用佣金 <strong>{formatMinor(data.availableMinor)}</strong>
            </p>
            <div className="grid gap-group sm:grid-cols-2">
                {data.availableMinor > 0 ? (
                    <CommissionAction commission={data} withdraw={false} />
                ) : null}
                {data.withdrawEnabled &&
                data.availableMinor >= data.withdrawMinMinor ? (
                    <CommissionAction commission={data} withdraw />
                ) : null}
            </div>
            {data.withdrawals.length ? (
                <ul className="space-y-field text-sm" aria-label="提现申请">
                    {data.withdrawals.map((row) => (
                        <li className="border-b pb-field" key={row.id}>
                            {row.method} · {formatMinor(row.amountMinor)} ·{" "}
                            {status[row.status]} ·{" "}
                            {formatDateTime(row.createdAt)}
                            {row.reason ? (
                                <p className="break-words text-muted-foreground">
                                    {row.reason}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}
            {data.entries.length ? (
                <ul className="space-y-field text-sm" aria-label="佣金流水">
                    {data.entries.map((row) => (
                        <li className="border-b pb-field" key={row.id}>
                            {entryLabels[row.kind]} ·{" "}
                            {formatMinor(row.amountMinor)} ·{" "}
                            {formatDateTime(row.createdAt)}
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
