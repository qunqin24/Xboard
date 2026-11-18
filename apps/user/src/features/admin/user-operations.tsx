import { useRef, useState, type FormEvent } from "react";
import type { BulkResetTrafficResult, Period } from "@xboard/contracts";
import { toast } from "sonner";
import { useCommand } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMinor, periodLabel } from "@/lib/format";
import type { PlanRow, UserRow } from "./types";

export function ManualOrder({
    user,
    plans,
}: {
    user: UserRow;
    plans: PlanRow[];
}) {
    const order = useCommand();
    const [planId, setPlanId] = useState("");
    const [period, setPeriod] = useState<Period | "">("");
    const previous = useRef<{ key: string; id: string } | null>(null);
    const sale = plans.filter(
        (plan) => plan.published && plan.prices.length > 0,
    );
    const plan = sale.find((p) => String(p.id) === planId);
    const price = plan?.prices.find((p) => p.period === period);
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!plan || !price) return;
        const key = `${user.id}:${plan.id}:${price.period}`;
        if (previous.current?.key !== key)
            previous.current = { key, id: crypto.randomUUID() };
        order.mutate(
            {
                path: `/admin/users/${user.id}/orders`,
                body: {
                    planId: plan.id,
                    period: price.period,
                    requestId: previous.current.id,
                },
            },
            {
                onSuccess: () => {
                    previous.current = null;
                    toast.success("待结算订单已创建");
                },
            },
        );
    }
    return (
        <form className="flex flex-col gap-group" onSubmit={submit}>
            <div className="grid gap-field">
                <Label htmlFor="manual-order-plan">套餐</Label>
                <Select
                    value={planId}
                    onValueChange={(value) => {
                        setPlanId(value);
                        setPeriod("");
                    }}
                >
                    <SelectTrigger id="manual-order-plan" className="w-full">
                        <SelectValue placeholder="选择在售套餐" />
                    </SelectTrigger>
                    <SelectContent>
                        {sale.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid gap-field">
                <Label htmlFor="manual-order-period">付款周期</Label>
                <Select
                    value={period}
                    onValueChange={(value) => setPeriod(value as Period)}
                    disabled={!plan}
                >
                    <SelectTrigger id="manual-order-period" className="w-full">
                        <SelectValue placeholder="选择付款周期" />
                    </SelectTrigger>
                    <SelectContent>
                        {plan?.prices.map((item) => (
                            <SelectItem key={item.period} value={item.period}>
                                {periodLabel(item.period)} ·{" "}
                                {formatMinor(item.amountMinor)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <p className="text-sm text-muted-foreground">
                订单创建后，用户可在“我的订单”中确认结算。
            </p>
            <div>
                <Button
                    type="submit"
                    disabled={user.banned || !price || order.isPending}
                >
                    创建待结算订单
                </Button>
            </div>
        </form>
    );
}

export function BulkResetTraffic({
    users,
    close,
    onDone,
}: {
    users: UserRow[];
    close: () => void;
    onDone: () => void;
}) {
    const reset = useCommand<BulkResetTrafficResult>();
    const [reason, setReason] = useState("");
    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && !reset.isPending && close()}
            title="批量清零已用流量"
            desc={`将清零所选 ${users.length} 位用户的已用流量。`}
            confirmText="确认清零"
            disabled={reason.trim().length < 3}
            destructive
            isLoading={reset.isPending}
            handleConfirm={() =>
                reset.mutate(
                    {
                        path: "/admin/users/reset-traffic",
                        body: { ids: users.map((user) => user.id), reason },
                    },
                    {
                        onSuccess: (result) => {
                            toast.success(
                                `已清零 ${result.updated} 位用户的流量${result.skipped ? `，跳过 ${result.skipped} 位` : ""}`,
                            );
                            onDone();
                        },
                    },
                )
            }
        >
            <div className="grid gap-field">
                <Label htmlFor="bulk-reset-reason">原因</Label>
                <Textarea
                    id="bulk-reset-reason"
                    rows={3}
                    maxLength={200}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                />
            </div>
        </ConfirmDialog>
    );
}
