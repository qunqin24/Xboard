import { Gift } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { redeemGiftBody, type redeemGiftResult } from "@xboard/contracts";
import { useCommand } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor, periodLabel } from "@/lib/format";

export function RedeemGift() {
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState("");
    const redeem = useCommand<z.infer<typeof redeemGiftResult>>();
    const body = redeemGiftBody.safeParse({ code });
    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <Gift /> 兑换码
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={(value) => {
                    setOpen(value);
                    if (!value) setCode("");
                }}
                title="兑换余额或套餐"
                desc="输入收到的兑换码。"
                confirmText="确认兑换"
                disabled={!body.success}
                isLoading={redeem.isPending}
                handleConfirm={() =>
                    body.success &&
                    redeem.mutate(
                        { path: "/account/redeem", body: body.data },
                        {
                            onSuccess: (result) => {
                                setOpen(false);
                                setCode("");
                                toast.success(
                                    result.kind === "balance"
                                        ? `已兑换 ${formatMinor(result.amountMinor)} 余额`
                                        : `已兑换 ${result.planName} · ${periodLabel(result.period)}`,
                                );
                            },
                        },
                    )
                }
            >
                <div className="grid gap-field">
                    <Label htmlFor="gift-code">兑换码</Label>
                    <Input
                        id="gift-code"
                        value={code}
                        autoComplete="off"
                        maxLength={37}
                        onChange={(event) => setCode(event.target.value)}
                    />
                </div>
            </ConfirmDialog>
        </>
    );
}
