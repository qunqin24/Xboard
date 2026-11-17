import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ColumnDef } from "@tanstack/react-table";
import { Ban, Check, Copy, KeyRound, UserCheck, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
    selectColumn,
} from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import { Page } from "@/components/layout/page";
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
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import type { PlanRow, UserRow } from "./types";
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
        .refine((v) => Number(v) > 0, "金额必须大于 0"),
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
                className="space-y-4"
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
                                expiredAt: secondsFromDate(v.expiry),
                                transferBytes: giBToBytes(v.transferGiB),
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
                            <FormLabel>到期日</FormLabel>
                            <DatePicker
                                selected={field.value}
                                onSelect={field.onChange}
                                placeholder="长期有效"
                                className="w-full"
                            />
                            <div className="flex flex-wrap gap-1.5">
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
                            <FormDescription>
                                按北京时间当天 23:59:59 到期；清空为长期有效。
                            </FormDescription>
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
                <div className="grid grid-cols-2 gap-3">
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
                <p className="text-xs text-muted-foreground">
                    直接修改订阅，不扣款，也不改动已用流量；写入审计日志。
                </p>
                <Button type="submit" disabled={save.isPending}>
                    保存订阅
                </Button>
            </form>
        </Form>
    );
}

function CreditForm({ user }: { user: UserRow }) {
    const credit = useCommand();
    // Retrying the same amount and reason reuses the request id, so a double
    // submit can never credit twice.
    const request = useRef<{ signature: string; id: string } | null>(null);
    const form = useForm<z.infer<typeof creditSchema>>({
        resolver: zodResolver(creditSchema),
        defaultValues: { amount: "", reason: "" },
    });
    return (
        <Form {...form}>
            <form
                className="space-y-4"
                onSubmit={form.handleSubmit((v) => {
                    const body = {
                        amountMinor: yuanToMinor(v.amount),
                        reason: v.reason,
                    };
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
                                toast.success(
                                    `已入账 ${formatMinor(body.amountMinor)}`,
                                );
                                form.reset();
                            },
                        },
                    );
                })}
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
                                    placeholder="转账单号 2026111700123"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <p className="text-xs text-muted-foreground">
                    写入余额流水和审计日志。
                </p>
                <Button type="submit" disabled={credit.isPending}>
                    确认入账
                </Button>
            </form>
        </Form>
    );
}

function ResetTrafficForm({ user }: { user: UserRow }) {
    const reset = useCommand();
    const form = useForm<z.infer<typeof resetSchema>>({
        resolver: zodResolver(resetSchema),
        defaultValues: { reason: "" },
    });
    return (
        <Form {...form}>
            <form
                className="space-y-4"
                onSubmit={form.handleSubmit((body) =>
                    reset.mutate(
                        { path: `/admin/users/${user.id}/reset-traffic`, body },
                        {
                            onSuccess: () => {
                                toast.success("流量已清零");
                                form.reset();
                            },
                        },
                    ),
                )}
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
                            <FormDescription>
                                上传和下载归零，额度和到期时间不变。
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    variant="outline"
                    disabled={reset.isPending}
                >
                    清零已用流量
                </Button>
            </form>
        </Form>
    );
}

function UserSheet({
    user,
    plans,
    onClose,
    onResetPassword,
    onToggleBan,
}: {
    user: UserRow | undefined;
    plans: PlanRow[];
    onClose: () => void;
    onResetPassword: (user: UserRow) => void;
    onToggleBan: (user: UserRow) => void;
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
                                    <Badge>管理员</Badge>
                                ) : null}
                                {user.banned ? (
                                    <Badge variant="destructive">已封禁</Badge>
                                ) : null}
                            </SheetTitle>
                            <SheetDescription className="numeric">
                                用户 #{user.id}
                            </SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted p-3 text-sm">
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
                                            (user.planId
                                                ? `#${user.planId}`
                                                : "未开通")}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground">
                                        已用流量
                                    </dt>
                                    <dd className="numeric">
                                        {formatTraffic(used)} /{" "}
                                        {formatTraffic(user.transferEnable)}
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
                                </TabsList>
                                <TabsContent
                                    value="subscription"
                                    className="pt-3"
                                >
                                    <SubscriptionForm
                                        key={JSON.stringify(user)}
                                        user={user}
                                        plans={plans}
                                    />
                                </TabsContent>
                                <TabsContent value="credit" className="pt-3">
                                    <CreditForm user={user} />
                                </TabsContent>
                                <TabsContent value="traffic" className="pt-3">
                                    <ResetTrafficForm user={user} />
                                </TabsContent>
                            </Tabs>
                            <Separator />
                            <div className="space-y-2">
                                <p className="text-sm font-medium">账户安全</p>
                                <p className="text-xs text-muted-foreground">
                                    {user.role === "admin"
                                        ? "管理员账户不能在这里重置密码或封禁。"
                                        : "重置密码和封禁都会立即撤销该用户的全部登录。"}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        disabled={user.role === "admin"}
                                        onClick={() => onResetPassword(user)}
                                    >
                                        <KeyRound /> 重置密码
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>临时密码</DialogTitle>
                    <DialogDescription>
                        这是 {value?.email}{" "}
                        的新密码，只显示这一次。请通过安全渠道告诉用户，并提醒对方登录后修改。
                    </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2">
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
                    <Button onClick={onClose}>我已保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type Pending =
    | { kind: "password"; user: UserRow }
    | { kind: "ban"; user: UserRow }
    | { kind: "bulk-ban"; users: UserRow[]; clear: () => void };

export function AdminUsers() {
    const list = usePanel<UserRow[]>("/admin/users");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const search = useSearch({ strict: false }) as { user?: number };
    const navigate = useNavigate();
    const action = useCommand();
    const [pending, setPending] = useState<Pending | null>(null);
    const [password, setPassword] = useState<{
        email: string;
        password: string;
    } | null>(null);
    const planName = new Map(plans.data?.map((p) => [p.id, p.name]));
    const selected = list.data?.find((u) => u.id === search.user);
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
                <div>
                    <div className="flex items-center gap-1.5">
                        <LongText className="max-w-52">
                            {row.original.email}
                        </LongText>
                        {row.original.role === "admin" ? (
                            <Badge variant="secondary">管理员</Badge>
                        ) : null}
                    </div>
                    <p className="numeric text-xs text-muted-foreground">
                        #{row.original.id}
                        {row.original.verifiedAt ? "" : " · 邮箱未验证"}
                    </p>
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
                <Badge
                    variant={
                        getValue() === "已封禁" ? "destructive" : "outline"
                    }
                >
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
            filterFn: inFilter,
            meta: { title: "套餐" },
        },
        {
            id: "verified",
            accessorFn: (u) => (u.verifiedAt ? "已验证" : "未验证"),
            header: "邮箱验证",
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
            cell: ({ row }) => (
                <span className="numeric text-muted-foreground">
                    {row.original.planId
                        ? formatDate(row.original.expiredAt)
                        : "—"}
                </span>
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
                        <div className="mt-1 h-1.5 rounded-full bg-muted">
                            <div
                                className={cn(
                                    "h-full rounded-full",
                                    percent >= 90
                                        ? "bg-amber-500"
                                        : "bg-primary",
                                )}
                                style={{ width: `${percent}%` }}
                            />
                        </div>
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
                <span className="numeric">
                    {formatMinor(row.original.balance)}
                </span>
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
            : pending?.kind === "ban"
              ? `封禁 ${pending.user.email}？`
              : `封禁选中的 ${pending?.users.length ?? 0} 个用户？`;

    return (
        <Page
            title="用户"
            description="最近注册的 200 个用户。点一行查看详情，可编辑订阅、入账、清零流量、重置密码或封禁。"
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
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
                        options: ["正常", "已封禁"].map((v) => ({
                            value: v,
                            label: v,
                        })),
                    },
                    {
                        columnId: "plan",
                        title: "套餐",
                        options: [
                            "未开通",
                            ...(plans.data?.map((p) => p.name) ?? []),
                        ].map((v) => ({ value: v, label: v })),
                    },
                    {
                        columnId: "verified",
                        title: "邮箱验证",
                        options: ["已验证", "未验证"].map((v) => ({
                            value: v,
                            label: v,
                        })),
                    },
                ]}
                bulkActions={(rows, clear) => (
                    <>
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
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bulkUnban(rows, clear)}
                        >
                            <UserCheck /> 解封
                        </Button>
                    </>
                )}
            />
            <UserSheet
                user={selected}
                plans={plans.data ?? []}
                onClose={() => select(null)}
                onResetPassword={(user) =>
                    setPending({ kind: "password", user })
                }
                onToggleBan={toggleBan}
            />
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && setPending(null)}
                title={confirmTitle}
                desc={
                    pending?.kind === "password"
                        ? "会生成一个临时密码并撤销该用户的全部登录，旧密码立即失效。"
                        : pending?.kind === "ban"
                          ? "立即撤销该用户的全部登录，节点也不再下发该用户。可以随时解除。"
                          : "管理员会被跳过。被封禁的用户立即退出登录，节点不再下发。"
                }
                confirmText={pending?.kind === "password" ? "重置" : "封禁"}
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
