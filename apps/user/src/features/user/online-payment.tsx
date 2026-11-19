import { useRef } from "react";
import type { Checkout, Order, PaymentGateway } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { LoadingButton } from "@/components/loading-button";
import { formatMinor } from "@/lib/format";
import { serverErrorMessage } from "@/lib/handle-server-error";

export function OnlinePayment({ order }: { order: Order }) {
    const gateways = usePanel<PaymentGateway[]>("/payments/gateways", {
        enabled: order.payableMinor > 0,
    });
    const checkout = useCommand<Checkout>({ inline: true });
    const requests = useRef(new Map<number, string>());
    if (!gateways.data?.length || order.payableMinor <= 0) return null;
    return (
        <div className="grid gap-field">
            <span className="text-sm font-medium">在线支付</span>
            {gateways.data.map((gateway) => {
                const fee =
                    Math.ceil(
                        (order.payableMinor * gateway.feePercentBasisPoints) /
                            10_000,
                    ) + gateway.feeFixedMinor;
                return (
                    <LoadingButton
                        key={gateway.id}
                        type="button"
                        variant="outline"
                        loading={checkout.isPending}
                        onClick={() => {
                            const requestId =
                                requests.current.get(gateway.id) ??
                                crypto.randomUUID();
                            requests.current.set(gateway.id, requestId);
                            checkout.mutate(
                                {
                                    path: `/orders/${order.id}/checkout`,
                                    body: { gatewayId: gateway.id, requestId },
                                },
                                {
                                    onSuccess: (result) =>
                                        window.location.assign(result.url),
                                },
                            );
                        }}
                    >
                        {gateway.icon ? (
                            <img
                                src={gateway.icon}
                                alt=""
                                className="size-4 rounded"
                            />
                        ) : null}
                        {gateway.name} · {formatMinor(order.payableMinor + fee)}
                    </LoadingButton>
                );
            })}
            {checkout.error ? (
                <p className="text-sm text-destructive" role="alert">
                    {serverErrorMessage(checkout.error)}
                </p>
            ) : null}
        </div>
    );
}
