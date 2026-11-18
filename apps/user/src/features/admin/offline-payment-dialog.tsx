import { useState } from "react";
import { offlineOrderPaymentBody, type Order } from "@xboard/contracts";
import { toast } from "sonner";
import { useCommand } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMinor, periodLabel } from "@/lib/format";
import type { OrderRow } from "./types";

export function OfflinePaymentDialog({
    order,
    onClose,
}: {
    order: OrderRow;
    onClose: () => void;
}) {
    const [reason, setReason] = useState("");
    const confirm = useCommand<Order>();
    const receipt = offlineOrderPaymentBody.safeParse({
        amountMinor: order.payableMinor,
        reason,
    });

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && !confirm.isPending && onClose()}
            title="确认线下收款"
            desc={
                <div className="flex flex-col gap-field">
                    <p className="wrap-anywhere">{order.user.email}</p>
                    <p>
                        {order.planName} · {periodLabel(order.period)}
                    </p>
                    <p>
                        实收金额{" "}
                        <strong className="numeric text-foreground">
                            {formatMinor(order.payableMinor)}
                        </strong>
                    </p>
                    <p>核实收款后确认，订单将立即结算。</p>
                </div>
            }
            confirmText="确认已收款"
            disabled={!receipt.success}
            isLoading={confirm.isPending}
            handleConfirm={() => {
                if (!receipt.success) return;
                confirm.mutate(
                    {
                        path: `/admin/orders/${order.id}/confirm-payment`,
                        body: receipt.data,
                    },
                    {
                        onSuccess: () => {
                            toast.success("线下收款已确认，订单已支付");
                            onClose();
                        },
                    },
                );
            }}
        >
            <div className="grid gap-field">
                <Label htmlFor="offline-payment-note">
                    收款备注或凭证号（选填）
                </Label>
                <Textarea
                    id="offline-payment-note"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={200}
                    rows={3}
                    disabled={confirm.isPending}
                />
            </div>
        </ConfirmDialog>
    );
}
