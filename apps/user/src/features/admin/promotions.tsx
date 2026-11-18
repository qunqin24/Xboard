import { useState, type FormEvent } from "react";
import { Gift as GiftIcon, Plus, TicketPercent } from "lucide-react";
import type {
    Coupon,
    CouponCreated,
    Gift,
    GiftCreated,
    Period,
} from "@xboard/contracts";
import { periodSchema } from "@xboard/contracts";
import { toast } from "sonner";
import { useOptimisticRows } from "@/api/use-optimistic-rows";
import { SaveStatus } from "@/components/save-status";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { IconBlock } from "@/components/ui/icon-block";
import { Page } from "@/components/layout/page";
import { SecretDialog } from "@/components/secret-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tile } from "@/components/ui/tile";
import { formatDateTime, formatMinor, periodLabel } from "@/lib/format";
import { EditorSheet } from "./editor-sheet";
import type { PlanRow } from "./types";
import { yuanToMinor } from "./units";

type Tab = "coupons" | "gift-codes";

function PromotionEditor({
    tab,
    close,
    onGift,
}: {
    tab: Tab;
    close: () => void;
    onGift: (code: string) => void;
}) {
    const coupon = tab === "coupons";
    const plans = usePanel<PlanRow[]>("/admin/plans", { enabled: !coupon });
    const save = useCommand<GiftCreated | CouponCreated>({ inline: true });
    const [kind, setKind] = useState<Gift["kind"]>("balance");
    const [plan, setPlan] = useState("");
    const [period, setPeriod] = useState<Period>("monthly");
    const amount = coupon || kind === "balance";
    const [pending, setPending] = useState<{
        body: Record<string, unknown>;
        summary: string;
    } | null>(null);
    function create(body: Record<string, unknown>) {
        save.mutate(
            { path: `/admin/${tab}`, body },
            {
                onSuccess: (result) => {
                    setPending(null);
                    close();
                    if ("code" in result) onGift(result.code);
                    else toast.success("优惠券已创建");
                },
            },
        );
    }
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const date = fields.get("expires");
        const expiresAt = date
            ? new Date(`${String(date)}T23:59:59.999+08:00`).toISOString()
            : null;
        const amountMinor = amount
            ? yuanToMinor(String(fields.get("amount")))
            : null;
        const body = coupon
            ? {
                  code: fields.get("code"),
                  amountMinor,
                  expiresAt,
                  maxUses: Number(fields.get("maxUses")),
              }
            : {
                  label: fields.get("label"),
                  expiresAt,
                  kind,
                  ...(amount
                      ? { amountMinor }
                      : { planId: Number(plan), period }),
              };
        if (amountMinor !== null && Number.isFinite(amountMinor)) {
            const money = formatMinor(amountMinor);
            setPending({
                body,
                summary: coupon
                    ? `将创建优惠码 ${String(fields.get("code"))}，优惠金额 ${money}，可使用 ${String(fields.get("maxUses"))} 次。`
                    : `将创建兑换码“${String(fields.get("label"))}”，兑换后向领取账户充入余额 ${money}。`,
            });
            return;
        }
        create(body);
    }
    return (
        <>
            <EditorSheet
                open
                onOpenChange={(open) => !open && close()}
                title={coupon ? "新建优惠券" : "新建兑换码"}
                formId="promotion-form"
                submitLabel="创建"
                pending={save.isPending}
                error={save.error}
                submitDisabled={!amount && !plan}
            >
                <form
                    id="promotion-form"
                    onSubmit={submit}
                    className="flex flex-col gap-group"
                >
                    {coupon ? (
                        <>
                            <div className="grid gap-field">
                                <Label htmlFor="promotion-code">优惠码</Label>
                                <Input
                                    id="promotion-code"
                                    name="code"
                                    minLength={4}
                                    maxLength={48}
                                    required
                                    autoComplete="off"
                                    pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{3,47}"
                                />
                            </div>
                            <div className="grid gap-field">
                                <div className="flex items-center gap-inline">
                                    <Label htmlFor="promotion-limit">
                                        可使用次数
                                    </Label>
                                    <InfoTip label="可使用次数">
                                        每个账户限用一次。
                                    </InfoTip>
                                </div>
                                <Input
                                    id="promotion-limit"
                                    name="maxUses"
                                    type="number"
                                    min={1}
                                    max={100_000}
                                    defaultValue={1}
                                    required
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="grid gap-field">
                                <Label htmlFor="promotion-label">
                                    备注名称
                                </Label>
                                <Input
                                    id="promotion-label"
                                    name="label"
                                    maxLength={80}
                                    required
                                />
                            </div>
                            <div className="grid gap-field">
                                <Label htmlFor="promotion-kind">兑换内容</Label>
                                <Select
                                    value={kind}
                                    onValueChange={(value) =>
                                        setKind(value as Gift["kind"])
                                    }
                                >
                                    <SelectTrigger id="promotion-kind">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="balance">
                                            余额
                                        </SelectItem>
                                        <SelectItem value="subscription">
                                            套餐
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}
                    {amount ? (
                        <div className="grid gap-field">
                            <Label htmlFor="promotion-amount">
                                {coupon ? "优惠金额（元）" : "兑换金额（元）"}
                            </Label>
                            <Input
                                id="promotion-amount"
                                name="amount"
                                type="number"
                                min={0.01}
                                max={1_000_000}
                                step={0.01}
                                required
                            />
                        </div>
                    ) : (
                        <>
                            <div className="grid gap-field">
                                <Label htmlFor="gift-plan">套餐</Label>
                                <Select value={plan} onValueChange={setPlan}>
                                    <SelectTrigger
                                        id="gift-plan"
                                        className="w-full"
                                    >
                                        <SelectValue placeholder="选择套餐" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {plans.data?.map((plan) => (
                                            <SelectItem
                                                key={plan.id}
                                                value={String(plan.id)}
                                            >
                                                {plan.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {plans.isError && (
                                    <ErrorState
                                        error={plans.error}
                                        onRetry={() => plans.refetch()}
                                    />
                                )}
                            </div>
                            <div className="grid gap-field">
                                <Label htmlFor="gift-period">有效期</Label>
                                <Select
                                    value={period}
                                    onValueChange={(value) =>
                                        setPeriod(value as Period)
                                    }
                                >
                                    <SelectTrigger id="gift-period">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {periodSchema.options.map((p) => (
                                            <SelectItem key={p} value={p}>
                                                {periodLabel(p)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}
                    <div className="grid gap-field">
                        <div className="flex items-center gap-inline">
                            <Label htmlFor="promotion-expires">
                                到期日（北京时间）
                            </Label>
                            <InfoTip label="到期日">留空为长期有效。</InfoTip>
                        </div>
                        <Input
                            id="promotion-expires"
                            name="expires"
                            type="date"
                        />
                    </div>
                </form>
            </EditorSheet>
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) =>
                    !open && !save.isPending && setPending(null)
                }
                title={coupon ? "确认创建优惠券" : "确认创建兑换码"}
                desc={pending?.summary ?? ""}
                confirmText="确认创建"
                isLoading={save.isPending}
                handleConfirm={() => pending && create(pending.body)}
            />
        </>
    );
}

export function AdminPromotions() {
    const [tab, setTab] = useState<Tab>("coupons");
    const [editing, setEditing] = useState<Tab | null>(null);
    const [issuedCode, setIssuedCode] = useState<string | null>(null);
    const coupons = usePanel<Coupon[]>("/admin/coupons");
    const gifts = usePanel<Gift[]>("/admin/gift-codes");
    const couponRows = useOptimisticRows<Coupon>("/admin/coupons");
    const giftRows = useOptimisticRows<Gift>("/admin/gift-codes");
    const showRows = (query: typeof coupons | typeof gifts) => {
        if (query.isPending) return <Skeleton className="h-40" />;
        if (query.isError)
            return (
                <ErrorState
                    error={query.error}
                    onRetry={() => query.refetch()}
                />
            );
        if (!query.data.length)
            return (
                <EmptyState
                    title={tab === "coupons" ? "暂无优惠券" : "暂无兑换码"}
                />
            );
        return query.data.map((row) => {
            const isCoupon = "code" in row;
            // The two lists share one row layout; each has its own cache entry.
            const rows = (
                isCoupon ? couponRows : giftRows
            ) as typeof couponRows;
            const expired =
                !!row.expiresAt && Date.parse(row.expiresAt) <= Date.now();
            const consumed = isCoupon
                ? row.used >= row.maxUses
                : row.redeemedAt !== null;
            const status = consumed
                ? isCoupon
                    ? "已用完"
                    : "已兑换"
                : expired
                  ? "已到期"
                  : row.enabled
                    ? "可使用"
                    : "已停用";
            return (
                <Tile key={row.id} className="flex-wrap">
                    <IconBlock>
                        {isCoupon ? <TicketPercent /> : <GiftIcon />}
                    </IconBlock>
                    <div className="min-w-0 flex-1">
                        <p className="font-medium wrap-anywhere">
                            {isCoupon ? row.code : row.label}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {isCoupon
                                ? formatMinor(row.amountMinor)
                                : row.amountMinor === null
                                  ? `${row.planName} · ${periodLabel(row.period)}`
                                  : formatMinor(row.amountMinor)}
                            {isCoupon && ` · 已用 ${row.used}/${row.maxUses}`}
                            {row.expiresAt &&
                                ` · ${formatDateTime(row.expiresAt)} 到期`}
                        </p>
                    </div>
                    <SaveStatus
                        state={rows.status(row.id)}
                        onRetry={() => rows.retry(row.id)}
                    />
                    <Badge
                        variant={
                            consumed
                                ? "secondary"
                                : expired
                                  ? "danger"
                                  : row.enabled
                                    ? "success"
                                    : "secondary"
                        }
                    >
                        {status}
                    </Badge>
                    {!consumed && !expired && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                rows.change({
                                    id: row.id,
                                    fields: { enabled: !row.enabled },
                                    path: `/admin/${isCoupon ? "coupons" : "gift-codes"}/${row.id}/enabled`,
                                    body: { enabled: !row.enabled },
                                })
                            }
                        >
                            {row.enabled ? "停用" : "启用"}
                        </Button>
                    )}
                </Tile>
            );
        });
    };
    return (
        <Page
            title="优惠与兑换"
            actions={
                <Button onClick={() => setEditing(tab)}>
                    <Plus /> {tab === "coupons" ? "新建优惠券" : "新建兑换码"}
                </Button>
            }
        >
            <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as Tab)}
                className="gap-page"
            >
                <TabsList>
                    <TabsTrigger value="coupons">优惠券</TabsTrigger>
                    <TabsTrigger value="gift-codes">兑换码</TabsTrigger>
                </TabsList>
                <TabsContent
                    value="coupons"
                    className="flex flex-col gap-group"
                >
                    {tab === "coupons" && showRows(coupons)}
                </TabsContent>
                <TabsContent
                    value="gift-codes"
                    className="flex flex-col gap-group"
                >
                    {tab === "gift-codes" && showRows(gifts)}
                </TabsContent>
            </Tabs>
            {editing && (
                <PromotionEditor
                    tab={editing}
                    close={() => setEditing(null)}
                    onGift={setIssuedCode}
                />
            )}
            <SecretDialog
                title="兑换码"
                description="兑换码仅显示一次，请保存后发给领取人。"
                value={issuedCode}
                onClose={() => setIssuedCode(null)}
            />
        </Page>
    );
}
