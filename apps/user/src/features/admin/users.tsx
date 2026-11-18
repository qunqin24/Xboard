import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ColumnDef } from "@tanstack/react-table";
import {
    Ban,
    CalendarClock,
    Check,
    CircleCheck,
    Copy,
    KeyRound,
    MailCheck,
    MailPlus,
    MailWarning,
    Package,
    RefreshCw,
    ShieldOff,
    UserCheck,
    UserRound,
    Wallet,
} from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { queryString } from "@/api/client";
import { useCommand, usePanel } from "@/api/panel";
import { LoadingButton } from "@/components/loading-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
    selectColumn,
    useServerTable,
} from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
import { IconBlock } from "@/components/ui/icon-block";
import { IconText } from "@/components/icon-text";
import { LongText } from "@/components/long-text";
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
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    formatDate,
    formatMinor,
    formatTraffic,
    sumBytes,
    usedPercent,
} from "@/lib/format";
import type { Paged, PlanRow, UserRow } from "./types";
import { BroadcastEditor } from "./mail-tools";
import { BulkResetTraffic, ManualOrder } from "./user-operations";
import {
    bytesToGiB,
    fromDateInput,
    giBToBytes,
    toDateInput,
    yuanToMinor,
} from "./units";

const optionalInt = (max: number) =>
    z
        .string()
        .regex(/^\d*$/, "请输入整数")
        .refine(
            (v) => !v || (Number(v) >= 1 && Number(v) <= max),
            `1 到 ${max}`,
        );

const subscriptionSchema = z.object({
    planId: z.string(),
    expiry: z.date().optional(),
    transferGiB: z.string().regex(/^\d+(\.\d{1,2})?$/, "请输入 GB 数"),
    speedLimit: optionalInt(100000),
    deviceLimit: optionalInt(1000),
});

const creditSchema = z.object({
    amount: z
        .string()
        .regex(/^\d{1,7}(\.\d{1,2})?$/, "最多两位小数")
        .refine((v) => Number(v) > 0, "金额必须大于 0")
        .refine((v) => Number(v) <= 1_000_000, "单笔最多 ¥1,000,000"),
    reason: z.string().trim().min(3, "至少 3 个字").max(200, "最多 200 个字"),
});

const resetSchema = z.object({
    reason: z.string().trim().min(3, "至少 3 个字").max(200, "最多 200 个字"),
});

/** YYYY-MM-DD (Shanghai) ↔ the local Date the calendar works with. */
const dateFromSeconds = (seconds: number | null) => {
    const text = toDateInput(seconds);
    if (!text) return undefined;
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
};
const secondsFromDate = (date: Date | undefined) =>
    date
        ? fromDateInput(
              `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
          )
        : null;

function SubscriptionForm({
    user,
    plans,
}: {
    user: UserRow;
    plans: PlanRow[];
}) {
    const save = useCommand();
    const form = useForm<z.infer<typeof subscriptionSchema>>({
        resolver: zodResolver(subscriptionSchema),
        defaultValues: {
            planId: user.planId ? String(user.planId) : "none",
            expiry: dateFromSeconds(user.expiredAt),
            transferGiB: bytesToGiB(user.transferEnable),
            speedLimit: user.speedLimit ? String(user.speedLimit) : "",
            deviceLimit: user.deviceLimit ? String(user.deviceLimit) : "",
        },
    });
    const extend = (days: number) => {
        const base = form.getValues("expiry");
        const start = base && base > new Date() ? base : new Date();
        form.setValue("expiry", new Date(start.getTime() + days * 86400000), {
            shouldDirty: true,
        });
    };

    return (
        <Form {...form}>
            <form
                className="space-y-group"
                onSubmit={form.handleSubmit((v) =>
                    save.mutate(
                        {
                            path: `/admin/users/${user.id}`,
                            method: "PUT",
                            body: {
                                planId:
                                    v.planId === "none"
                                        ? null
                                        : Number(v.planId),
                                // Untouched fields go back unchanged: the form
                                // shows rounded GB and whole days, and saving
                                // those would quietly rewrite the exact values.
                                expiredAt: form.formState.dirtyFields.expiry
                                    ? secondsFromDate(v.expiry)
                                    : user.expiredAt,
                                transferBytes: form.formState.dirtyFields
                                    .transferGiB
                                    ? giBToBytes(v.transferGiB)
                                    : user.transferEnable,
                                speedLimit: v.speedLimit
                                    ? Number(v.speedLimit)
                                    : null,
                                deviceLimit: v.deviceLimit
                                    ? Number(v.deviceLimit)
                                    : null,
                            },
                        },
                        { onSuccess: () => toast.success("订阅已更新") },
                    ),
                )}
            >
                <FormField
                    control={form.control}
                    name="planId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>套餐</FormLabel>
                            <Select
                                value={field.value}
                                onValueChange={field.onChange}
                            >
                                <FormControl>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">未开通</SelectItem>
                                    {plans.map((plan) => (
                                        <SelectItem
                                            key={plan.id}
                                            value={String(plan.id)}
                                        >
                                            {plan.name}
                                            {plan.published ? "" : "（未发布）"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="expiry"
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center gap-1">
                                <FormLabel>到期日</FormLabel>
                                <InfoTip>
                                    到期时间为北京时间当日 23:59:59。
                                </InfoTip>
                            </div>
                            <DatePicker
                                selected={field.value}
                                onSelect={field.onChange}
                                placeholder="长期有效"
                                className="w-full"
                            />
                            <div className="flex flex-wrap gap-2">
                                {[30, 90, 365].map((days) => (
                                    <Button
                                        key={days}
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => extend(days)}
                                    >
                                        +{days} 天
                                    </Button>
                                ))}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => field.onChange(undefined)}
                                >
                                    长期
                                </Button>
                            </div>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="transferGiB"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>流量额度（GB）</FormLabel>
                            <FormControl>
                                <Input inputMode="decimal" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-group">
                    <FormField
                        control={form.control}
                        name="speedLimit"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>限速（Mbps）</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="numeric"
                                        placeholder="不限"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="deviceLimit"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>设备数</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="numeric"
                                        placeholder="不限"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="flex items-center gap-inline">
                    <LoadingButton type="submit" loading={save.isPending}>
                        保存订阅
                    </LoadingButton>
                    <InfoTip>修改不产生扣费，不影响已用流量。</InfoTip>
                </div>
            </form>
        </Form>
    );
}

function CreditForm({ user }: { user: UserRow }) {
    const credit = useCommand();
    // Retrying the same amount and reason reuses the request id, so a double
    // submit can never credit twice.
    const request = useRef<{ signature: string; id: string } | null>(null);
    // Validated values waiting for the administrator's confirmation.
    const [confirming, setConfirming] = useState<{
        amountMinor: number;
        reason: string;
    } | null>(null);
    const form = useForm<z.infer<typeof creditSchema>>({
        resolver: zodResolver(creditSchema),
        defaultValues: { amount: "", reason: "" },
    });
    const submit = () => {
        if (!confirming) return;
        const body = confirming;
        const signature = JSON.stringify(body);
        if (request.current?.signature !== signature)
            request.current = {
                signature,
                id: crypto.randomUUID(),
            };
        credit.mutate(
            {
                path: `/admin/users/${user.id}/credit`,
                body: { ...body, requestId: request.current.id },
            },
            {
                onSuccess: () => {
                    request.current = null;
                    toast.success(`已入账 ${formatMinor(body.amountMinor)}`);
                    form.reset();
                },
                onSettled: () => setConfirming(null),
            },
        );
    };
    return (
        <Form {...form}>
            <form
                className="space-y-group"
                onSubmit={form.handleSubmit((v) =>
                    setConfirming({
                        amountMinor: yuanToMinor(v.amount),
                        reason: v.reason,
                    }),
                )}
            >
                <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>金额（元）</FormLabel>
                            <FormControl>
                                <Input inputMode="decimal" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>凭证或原因</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="例如：转账单号 2026111700123"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <LoadingButton type="submit" loading={credit.isPending}>
                    确认入账
                </LoadingButton>
            </form>
            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
                title="确认入账？"
                desc={`将向 ${user.email} 的账户入账 ${formatMinor(confirming?.amountMinor ?? 0)}，并写入余额流水和审计日志。`}
                confirmText="确认入账"
                isLoading={credit.isPending}
                handleConfirm={submit}
            />
        </Form>
    );
}

function ResetTrafficForm({ user }: { user: UserRow }) {
    const reset = useCommand();
    const [confirming, setConfirming] = useState<{ reason: string } | null>(
        null,
    );
    const form = useForm<z.infer<typeof resetSchema>>({
        resolver: zodResolver(resetSchema),
        defaultValues: { reason: "" },
    });
    return (
        <Form {...form}>
            <form
                className="space-y-group"
                onSubmit={form.handleSubmit((body) => setConfirming(body))}
            >
                <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>原因</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <LoadingButton
                    type="submit"
                    variant="destructive"
                    loading={reset.isPending}
                >
                    清零已用流量
                </LoadingButton>
            </form>
            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
                title={`清零 ${user.email} 的已用流量？`}
                desc="将清零上传与下载流量，不影响流量额度和到期时间。"
                confirmText="清零"
                destructive
                isLoading={reset.isPending}
                handleConfirm={() => {
                    if (!confirming) return;
                    reset.mutate(
                        {
                            path: `/admin/users/${user.id}/reset-traffic`,
                            body: confirming,
                        },
                        {
                            onSuccess: () => {
                                toast.success("流量已清零");
                                form.reset();
                            },
                            onSettled: () => setConfirming(null),
                        },
                    );
                }}
            />
        </Form>
    );
}

function UserSheet({
    user,
    plans,
    onClose,
    onResetPassword,
    onToggleBan,
    onRotateCredentials,
    onResetTwoFactor,
}: {
    user: UserRow | undefined;
    plans: PlanRow[];
    onClose: () => void;
    onResetPassword: (user: UserRow) => void;
    onToggleBan: (user: UserRow) => void;
    onRotateCredentials: (user: UserRow) => void;
    onResetTwoFactor: (user: UserRow) => void;
}) {
    const plan = plans.find((p) => p.id === user?.planId);
    const used = user ? sumBytes(user.upload, user.download) : "0";
    return (
        <Sheet open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="flex flex-col gap-0 sm:max-w-md">
                {user ? (
                    <>
                        <SheetHeader className="text-start">
                            <SheetTitle className="flex items-center gap-2">
                                <span className="truncate">{user.email}</span>
                                {user.role === "admin" ? (
                                    <Badge variant="secondary">管理员</Badge>
                                ) : null}
                                {user.banned ? (
                                    <Badge variant="danger">已封禁</Badge>
                                ) : null}
                            </SheetTitle>
                            <SheetDescription className="numeric">
                                用户 #{user.id}
                            </SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 space-y-group overflow-y-auto px-card pb-card">
                            <dl className="grid grid-cols-2 gap-group text-sm">
                                <div>
                                    <dt className="text-xs text-muted-foreground">
                                        余额
                                    </dt>
                                    <dd className="numeric">
                                        {formatMinor(user.balance)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground">
                                        套餐
                                    </dt>
                                    <dd>
                                        {plan?.name ??
                                            (user.planId ? (
                                                `#${user.planId}`
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    未开通
                                                </span>
                                            ))}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground">
                                        到期
                                    </dt>
                                    <dd className="numeric">
                                        {user.planId
                                            ? formatDate(user.expiredAt)
                                            : "—"}
                                    </dd>
                                </div>
                                <div className="min-w-0">
                                    <dt className="text-xs text-muted-foreground">
                                        邀请人
                                    </dt>
                                    <dd className="truncate">
                                        {user.invitedBy ?? "—"}
                                    </dd>
                                </div>
                                <div className="col-span-2">
                                    <dt className="text-xs text-muted-foreground">
                                        已用流量
                                    </dt>
                                    <dd className="numeric">
                                        {formatTraffic(used)} /{" "}
                                        {formatTraffic(user.transferEnable)}
                                    </dd>
                                    <Progress
                                        className="mt-2 h-1.5"
                                        value={usedPercent(
                                            used,
                                            user.transferEnable,
                                        )}
                                        tone={
                                            usedPercent(
                                                used,
                                                user.transferEnable,
                                            ) >= 90
                                                ? "warning"
                                                : "default"
                                        }
                                    />
                                </div>
                            </dl>
                            <Tabs defaultValue="subscription">
                                <TabsList className="w-full">
                                    <TabsTrigger value="subscription">
                                        订阅
                                    </TabsTrigger>
                                    <TabsTrigger value="credit">
                                        入账
                                    </TabsTrigger>
                                    <TabsTrigger value="traffic">
                                        流量
                                    </TabsTrigger>
                                    <TabsTrigger value="order">
                                        开单
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent
                                    value="subscription"
                                    className="pt-4"
                                >
                                    <SubscriptionForm
                                        key={JSON.stringify(user)}
                                        user={user}
                                        plans={plans}
                                    />
                                </TabsContent>
                                <TabsContent value="credit" className="pt-4">
                                    <CreditForm user={user} />
                                </TabsContent>
                                <TabsContent value="traffic" className="pt-4">
                                    <ResetTrafficForm user={user} />
                                </TabsContent>
                                <TabsContent value="order" className="pt-4">
                                    <ManualOrder user={user} plans={plans} />
                                </TabsContent>
                            </Tabs>
                            <Separator />
                            <div className="space-y-field">
                                <div className="flex items-center gap-1">
                                    <h3 className="text-sm font-medium">
                                        账户安全
                                    </h3>
                                    {user.role === "admin" ? (
                                        <InfoTip>
                                            管理员账户不支持在此重置密码或封禁。
                                        </InfoTip>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap gap-inline">
                                    <Button
                                        variant="outline"
                                        disabled={user.role === "admin"}
                                        onClick={() => onResetPassword(user)}
                                    >
                                        <KeyRound /> 重置密码
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            onRotateCredentials(user)
                                        }
                                    >
                                        <RefreshCw /> 更换节点凭据
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={
                                            user.role === "admin" ||
                                            !user.twoFactorEnabled
                                        }
                                        onClick={() => onResetTwoFactor(user)}
                                    >
                                        <ShieldOff /> 重置两步验证
                                    </Button>
                                    <Button
                                        variant={
                                            user.banned
                                                ? "outline"
                                                : "destructive"
                                        }
                                        disabled={user.role === "admin"}
                                        onClick={() => onToggleBan(user)}
                                    >
                                        {user.banned ? <UserCheck /> : <Ban />}
                                        {user.banned ? "解除封禁" : "封禁"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function TemporaryPassword({
    value,
    onClose,
}: {
    value: { email: string; password: string } | null;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <Dialog
            open={value !== null}
            onOpenChange={(open) => !open && (setCopied(false), onClose())}
        >
            <DialogContent
                showCloseButton={false}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>临时密码</DialogTitle>
                    <DialogDescription>
                        {value?.email}{" "}
                        的临时密码仅显示一次。请通过安全渠道发送给用户，并提示其登录后修改密码。
                    </DialogDescription>
                </DialogHeader>
                <div className="flex gap-inline">
                    <Input
                        readOnly
                        value={value?.password ?? ""}
                        onFocus={(e) => e.target.select()}
                        className="numeric tracking-wider"
                        aria-label="临时密码"
                    />
                    <Button
                        variant="outline"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(
                                    value?.password ?? "",
                                );
                                setCopied(true);
                            } catch {
                                toast.error("无法访问剪贴板，请手动复制。");
                            }
                        }}
                    >
                        {copied ? <Check /> : <Copy />}
                        {copied ? "已复制" : "复制"}
                    </Button>
                </div>
                <DialogFooter>
                    <Button
                        onClick={() => {
                            setCopied(false);
                            onClose();
                        }}
                    >
                        我已保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type Pending =
    | { kind: "password"; user: UserRow }
    | { kind: "credentials"; user: UserRow }
    | { kind: "two-factor"; user: UserRow }
    | { kind: "ban"; user: UserRow }
    | { kind: "bulk-ban"; users: UserRow[]; clear: () => void };

export function AdminUsers() {
    const table = useServerTable();
    const list = usePanel<Paged<UserRow>>(
        `/admin/users${queryString({
            ...table.query,
            status: table.filter("status"),
            plan: table.filter("plan"),
            verified: table.filter("verified"),
        })}`,
        { keepPrevious: true },
    );
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const search = useSearch({ strict: false }) as { user?: number };
    const navigate = useNavigate();
    const action = useCommand();
    const [pending, setPending] = useState<Pending | null>(null);
    const [reset, setReset] = useState<{
        users: UserRow[];
        clear: () => void;
    } | null>(null);
    const [mail, setMail] = useState<number[] | null>(null);
    const [password, setPassword] = useState<{
        email: string;
        password: string;
    } | null>(null);
    const planName = new Map(plans.data?.map((p) => [p.id, p.name]));
    // The user in the URL may be on another page; then load it on its own.
    const onPage = list.data?.items.find((u) => u.id === search.user);
    const single = usePanel<UserRow>(`/admin/users/${search.user ?? 0}`, {
        enabled: Boolean(search.user) && !onPage && !list.isPending,
    });
    const selected = onPage ?? (search.user ? single.data : undefined);
    const select = (id: number | null) =>
        void navigate({
            to: "/admin/users",
            search: id === null ? {} : { user: id },
        });

    const toggleBan = (user: UserRow) => {
        if (user.banned)
            action.mutate(
                {
                    path: `/admin/users/${user.id}/ban`,
                    body: { banned: false },
                },
                { onSuccess: () => toast.success("已解除封禁") },
            );
        else setPending({ kind: "ban", user });
    };

    const bulkUnban = (users: UserRow[], clear: () => void) =>
        action.mutate(
            {
                path: "/admin/users/ban",
                body: { ids: users.map((u) => u.id), banned: false },
            },
            {
                onSuccess: (result) => {
                    toast.success(`已解封 ${String(result.updated)} 个用户`);
                    clear();
                },
            },
        );

    const columns: ColumnDef<UserRow>[] = [
        selectColumn<UserRow>(),
        {
            accessorKey: "email",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="用户" />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <IconBlock
                        size="sm"
                        tone={
                            row.original.banned
                                ? "danger"
                                : row.original.role === "admin"
                                  ? "brand"
                                  : "neutral"
                        }
                    >
                        {row.original.email.slice(0, 1).toUpperCase()}
                    </IconBlock>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <LongText className="max-w-52">
                                {row.original.email}
                            </LongText>
                            {row.original.role === "admin" ? (
                                <Badge variant="secondary">管理员</Badge>
                            ) : null}
                            {row.original.verifiedAt ? null : (
                                <Badge variant="warning">未验证</Badge>
                            )}
                        </div>
                        <p className="numeric text-xs text-muted-foreground">
                            #{row.original.id}
                        </p>
                    </div>
                </div>
            ),
            enableHiding: false,
            meta: { title: "邮箱" },
        },
        {
            id: "status",
            accessorFn: (u) => (u.banned ? "已封禁" : "正常"),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ getValue }) => (
                <Badge variant={getValue() === "已封禁" ? "danger" : "success"}>
                    {getValue() === "已封禁" ? <Ban /> : <CircleCheck />}
                    {getValue<string>()}
                </Badge>
            ),
            filterFn: inFilter,
            meta: { title: "状态" },
        },
        {
            id: "plan",
            accessorFn: (u) =>
                u.planId
                    ? (planName.get(u.planId) ?? `#${u.planId}`)
                    : "未开通",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="套餐" />
            ),
            cell: ({ getValue }) =>
                getValue<string>() === "未开通" ? (
                    <span className="text-muted-foreground">未开通</span>
                ) : (
                    <IconText icon={Package} className="font-sans">
                        {getValue<string>()}
                    </IconText>
                ),
            filterFn: inFilter,
            meta: { title: "套餐" },
        },
        {
            id: "verified",
            accessorFn: (u) => (u.verifiedAt ? "已验证" : "未验证"),
            header: "邮箱验证",
            cell: ({ getValue }) => (
                <Badge
                    variant={getValue() === "已验证" ? "success" : "warning"}
                >
                    {getValue() === "已验证" ? <MailCheck /> : <MailWarning />}
                    {getValue<string>()}
                </Badge>
            ),
            filterFn: inFilter,
            enableSorting: false,
            meta: { title: "邮箱验证" },
        },
        {
            id: "expiredAt",
            accessorFn: (u) =>
                u.planId ? (u.expiredAt ?? Number.MAX_SAFE_INTEGER) : undefined,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="到期" />
            ),
            cell: ({ row }) =>
                row.original.planId ? (
                    <IconText icon={CalendarClock}>
                        {formatDate(row.original.expiredAt)}
                    </IconText>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
            sortUndefined: "last",
            meta: {
                title: "到期",
                exportValue: (u) => (u.planId ? formatDate(u.expiredAt) : ""),
            },
        },
        {
            id: "usage",
            accessorFn: (u) =>
                usedPercent(sumBytes(u.upload, u.download), u.transferEnable),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="流量" />
            ),
            cell: ({ row, getValue }) => {
                const percent = getValue<number>();
                return (
                    <div className="min-w-32">
                        <p className="numeric text-xs text-muted-foreground">
                            {formatTraffic(
                                sumBytes(
                                    row.original.upload,
                                    row.original.download,
                                ),
                            )}{" "}
                            / {formatTraffic(row.original.transferEnable)}
                        </p>
                        <Progress
                            className="mt-1"
                            value={percent}
                            tone={percent >= 90 ? "warning" : "default"}
                        />
                    </div>
                );
            },
            meta: {
                title: "流量",
                exportValue: (u) =>
                    `${formatTraffic(sumBytes(u.upload, u.download))} / ${formatTraffic(u.transferEnable)}`,
            },
        },
        {
            accessorKey: "balance",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="余额" />
            ),
            cell: ({ row }) => (
                <IconText icon={Wallet}>
                    {formatMinor(row.original.balance)}
                </IconText>
            ),
            meta: {
                title: "余额",
                exportValue: (u) => (u.balance / 100).toFixed(2),
            },
        },
        {
            id: "actions",
            enableHiding: false,
            cell: ({ row }) => (
                <RowActions
                    actions={[
                        {
                            label: "查看详情",
                            icon: UserRound,
                            onSelect: () => select(row.original.id),
                        },
                        "separator",
                        {
                            label: "重置密码",
                            icon: KeyRound,
                            disabled: row.original.role === "admin",
                            onSelect: () =>
                                setPending({
                                    kind: "password",
                                    user: row.original,
                                }),
                        },
                        {
                            label: row.original.banned ? "解除封禁" : "封禁",
                            icon: row.original.banned ? UserCheck : Ban,
                            destructive: !row.original.banned,
                            disabled: row.original.role === "admin",
                            onSelect: () => toggleBan(row.original),
                        },
                    ]}
                />
            ),
            meta: { className: "w-12" },
        },
    ];

    const confirmTitle =
        pending?.kind === "password"
            ? `重置 ${pending.user.email} 的密码？`
            : pending?.kind === "credentials"
              ? `更换 ${pending.user.email} 的节点凭据？`
              : pending?.kind === "two-factor"
                ? `重置 ${pending.user.email} 的两步验证？`
                : pending?.kind === "ban"
                  ? `封禁 ${pending.user.email}？`
                  : `封禁选中的 ${pending?.users.length ?? 0} 个用户？`;

    return (
        <Page
            title="用户"
            description={list.data ? `共 ${list.data.total} 位用户` : undefined}
        >
            <DataTable
                data={list.data?.items}
                server={{
                    state: table.state,
                    onStateChange: table.setState,
                    rowCount: list.data?.total,
                }}
                isLoading={list.isPending}
                isRefreshing={list.isPlaceholderData}
                error={list.isError ? list.error : undefined}
                onRetry={() => list.refetch()}
                columns={columns}
                getRowId={(u) => String(u.id)}
                searchPlaceholder="邮箱或编号…"
                exportName="用户"
                entityName="用户"
                initialHidden={{ verified: false }}
                onRowClick={(u) => select(u.id)}
                selectedRowId={search.user ? String(search.user) : null}
                filters={[
                    {
                        columnId: "status",
                        title: "状态",
                        options: [
                            { value: "active", label: "正常" },
                            { value: "banned", label: "已封禁" },
                        ],
                    },
                    {
                        columnId: "plan",
                        title: "套餐",
                        options: [
                            { value: "none", label: "未开通" },
                            ...(plans.data?.map((p) => ({
                                value: String(p.id),
                                label: p.name,
                            })) ?? []),
                        ],
                    },
                    {
                        columnId: "verified",
                        title: "邮箱验证",
                        options: [
                            { value: "verified", label: "已验证" },
                            { value: "unverified", label: "未验证" },
                        ],
                    },
                ]}
                bulkActions={(rows, clear) => (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReset({ users: rows, clear })}
                        >
                            <RefreshCw /> 清零流量
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMail(rows.map((row) => row.id))}
                        >
                            <MailPlus /> 群发邮件
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bulkUnban(rows, clear)}
                        >
                            <UserCheck /> 解封
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                                setPending({
                                    kind: "bulk-ban",
                                    users: rows,
                                    clear,
                                })
                            }
                        >
                            <Ban /> 封禁
                        </Button>
                    </>
                )}
            />
            {mail && (
                <BroadcastEditor
                    selectedIds={mail}
                    close={() => setMail(null)}
                />
            )}
            {reset && (
                <BulkResetTraffic
                    users={reset.users}
                    close={() => setReset(null)}
                    onDone={() => {
                        reset.clear();
                        setReset(null);
                    }}
                />
            )}
            <UserSheet
                user={selected}
                plans={plans.data ?? []}
                onClose={() => select(null)}
                onResetPassword={(user) =>
                    setPending({ kind: "password", user })
                }
                onToggleBan={toggleBan}
                onRotateCredentials={(user) =>
                    setPending({ kind: "credentials", user })
                }
                onResetTwoFactor={(user) =>
                    setPending({ kind: "two-factor", user })
                }
            />
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && setPending(null)}
                title={confirmTitle}
                desc={
                    pending?.kind === "password"
                        ? "将生成临时密码并使该用户所有登录会话失效，原密码立即作废。"
                        : pending?.kind === "credentials"
                          ? "原节点凭据在节点下次同步用户时失效，用户需要重新导入订阅。"
                          : pending?.kind === "two-factor"
                            ? "将移除该用户的两步验证和恢复码，并使其所有登录会话失效。用户之后仅凭密码登录，可自行重新启用。请先确认账户持有人身份。"
                            : pending?.kind === "ban"
                              ? "该用户所有登录会话将立即失效，节点将停止为其提供服务。可随时解除封禁。"
                              : "所选管理员账户将被跳过。被封禁用户将立即登出，节点停止为其提供服务。"
                }
                confirmText={
                    pending?.kind === "password"
                        ? "重置"
                        : pending?.kind === "credentials"
                          ? "更换"
                          : pending?.kind === "two-factor"
                            ? "重置"
                            : "封禁"
                }
                destructive
                isLoading={action.isPending}
                handleConfirm={() => {
                    if (!pending) return;
                    if (pending.kind === "password")
                        action.mutate(
                            {
                                path: `/admin/users/${pending.user.id}/password`,
                            },
                            {
                                onSuccess: (result) => {
                                    setPassword({
                                        email: pending.user.email,
                                        password: String(result.password),
                                    });
                                    setPending(null);
                                },
                            },
                        );
                    else if (pending.kind === "credentials")
                        action.mutate(
                            {
                                path: `/admin/users/${pending.user.id}/credentials`,
                            },
                            {
                                onSuccess: () => {
                                    toast.success("已更换节点凭据");
                                    setPending(null);
                                },
                            },
                        );
                    else if (pending.kind === "two-factor")
                        action.mutate(
                            {
                                path: `/admin/users/${pending.user.id}/two-factor/reset`,
                            },
                            {
                                onSuccess: () => {
                                    toast.success("已重置两步验证");
                                    setPending(null);
                                },
                            },
                        );
                    else if (pending.kind === "ban")
                        action.mutate(
                            {
                                path: `/admin/users/${pending.user.id}/ban`,
                                body: { banned: true },
                            },
                            {
                                onSuccess: () => {
                                    toast.success("已封禁");
                                    setPending(null);
                                },
                            },
                        );
                    else
                        action.mutate(
                            {
                                path: "/admin/users/ban",
                                body: {
                                    ids: pending.users.map((u) => u.id),
                                    banned: true,
                                },
                            },
                            {
                                onSuccess: (result) => {
                                    const skipped = Number(result.skipped);
                                    toast.success(
                                        `已封禁 ${String(result.updated)} 个用户${skipped ? `，跳过 ${skipped} 个管理员` : ""}`,
                                    );
                                    pending.clear();
                                    setPending(null);
                                },
                            },
                        );
                }}
            />
            <TemporaryPassword
                value={password}
                onClose={() => setPassword(null)}
            />
        </Page>
    );
}
