import { zodResolver } from "@hookform/resolvers/zod";
import { type ColumnDef } from "@tanstack/react-table";
import {
    ArrowDownUp,
    CircleCheck,
    CircleDashed,
    Eye,
    EyeOff,
    Gauge,
    MonitorSmartphone,
    Package,
    Pencil,
    Plus,
    Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
    periodSchema,
    trafficResetModeSchema,
    type TrafficResetMode,
} from "@xboard/contracts";
import { useOptimisticRows } from "@/api/use-optimistic-rows";
import { SaveStatus } from "@/components/save-status";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
} from "@/components/data-table";
import { CheckRow } from "@/components/check-row";
import { EmptyState } from "@/components/empty-state";
import { IconBlock } from "@/components/ui/icon-block";
import { IconText } from "@/components/icon-text";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatMinor, formatTraffic, periodLabel } from "@/lib/format";
import { useEditorSearch } from "./editor-search";
import { EditorSheet } from "./editor-sheet";
import { PUBLISH_TONE } from "./status";
import type { PlanRow } from "./types";
import { bytesToGiB, giBToBytes, minorToYuan, yuanToMinor } from "./units";

const PERIODS = periodSchema.options;
const RESET_MODES: Record<TrafficResetMode, string> = {
    none: "不重置",
    activation_day: "每月开通日",
    month_start: "每月 1 日",
    year_start: "每年 1 月 1 日",
    activation_anniversary: "每年开通日",
};
const money = z
    .string()
    .regex(/^(\d{1,7}(\.\d{1,2})?)?$/, "最多两位小数")
    .refine((v) => !v || Number(v) > 0, "价格需大于 0 元")
    .refine((v) => !v || Number(v) <= 1_000_000, "最多 ¥1,000,000");
const optionalInt = (max: number) =>
    z
        .string()
        .regex(/^\d*$/, "请输入整数")
        .refine(
            (v) => !v || (Number(v) >= 1 && Number(v) <= max),
            `1 到 ${max}`,
        );

const schema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, "请输入名称")
            .max(80, "名称最多 80 个字"),
        content: z.string().max(4000, "描述过长"),
        transferGiB: z
            .string()
            .regex(/^\d+(\.\d{1,2})?$/, "请输入 GB 数")
            .refine(
                (v) => Number(v) > 0 && Number(v) <= 900000,
                "0 到 900000 GB",
            ),
        trafficResetMode: trafficResetModeSchema,
        trafficResetPrice: money,
        speedLimit: optionalInt(100000),
        deviceLimit: optionalInt(1000),
        monthly: money,
        quarterly: money,
        half_yearly: money,
        yearly: money,
        two_yearly: money,
        three_yearly: money,
        onetime: money,
        sort: z.string().regex(/^\d+$/, "请输入整数"),
        published: z.boolean(),
    })
    .refine((v) => !v.published || PERIODS.some((p) => v[p] !== ""), {
        message: "发布前至少设置一个价格",
        path: ["monthly"],
    });

type Values = z.infer<typeof schema>;

/** PUT body for a listed plan, optionally flipping its published flag. */
export const planBody = (plan: PlanRow, published = plan.published) => ({
    name: plan.name,
    content: plan.content ?? "",
    transferBytes: plan.transferEnable,
    trafficResetMode: plan.trafficResetMode,
    trafficResetPriceMinor: plan.trafficResetPriceMinor,
    speedLimit: plan.speedLimit,
    deviceLimit: plan.deviceLimit,
    published,
    sort: plan.sort,
    prices: plan.prices.map(({ period, amountMinor }) => ({
        period,
        amountMinor,
    })),
});

function PlanSheet({
    plan,
    open,
    onClose,
}: {
    plan: PlanRow | null;
    open: boolean;
    onClose: () => void;
}) {
    const save = useCommand({ inline: true });
    const price = (period: string) => {
        const found = plan?.prices.find((p) => p.period === period);
        return found ? minorToYuan(found.amountMinor) : "";
    };
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        values: {
            name: plan?.name ?? "",
            content: plan?.content ?? "",
            transferGiB: plan ? bytesToGiB(plan.transferEnable) : "100",
            trafficResetMode: plan?.trafficResetMode ?? "none",
            trafficResetPrice: plan?.trafficResetPriceMinor
                ? minorToYuan(plan.trafficResetPriceMinor)
                : "",
            speedLimit: plan?.speedLimit ? String(plan.speedLimit) : "",
            deviceLimit: plan?.deviceLimit ? String(plan.deviceLimit) : "",
            monthly: price("monthly"),
            quarterly: price("quarterly"),
            half_yearly: price("half_yearly"),
            yearly: price("yearly"),
            two_yearly: price("two_yearly"),
            three_yearly: price("three_yearly"),
            onetime: price("onetime"),
            sort: String(plan?.sort ?? 0),
            published: plan?.published ?? false,
        },
    });
    // Opening the sheet starts from the saved values (or a blank "new"
    // form), never from a draft left by the previous open.
    useEffect(() => {
        if (open) form.reset();
    }, [open, form]);

    const submit = (v: Values) =>
        save.mutate(
            {
                path: plan ? `/admin/plans/${plan.id}` : "/admin/plans",
                method: plan ? "PUT" : "POST",
                body: {
                    name: v.name,
                    content: v.content,
                    // Unchanged GB goes back as the exact stored bytes; the
                    // two-decimal GB shown would otherwise round the quota.
                    transferBytes:
                        plan && !form.formState.dirtyFields.transferGiB
                            ? plan.transferEnable
                            : giBToBytes(v.transferGiB),
                    speedLimit: v.speedLimit ? Number(v.speedLimit) : null,
                    trafficResetMode: v.trafficResetMode,
                    trafficResetPriceMinor: v.trafficResetPrice
                        ? yuanToMinor(v.trafficResetPrice)
                        : null,
                    deviceLimit: v.deviceLimit ? Number(v.deviceLimit) : null,
                    published: v.published,
                    sort: Number(v.sort),
                    prices: PERIODS.filter((p) => v[p] !== "").map(
                        (period) => ({
                            period,
                            amountMinor: yuanToMinor(v[period]),
                        }),
                    ),
                },
            },
            {
                onSuccess: () => {
                    toast.success(plan ? "套餐已保存" : "套餐已创建");
                    onClose();
                },
            },
        );

    const text = (
        name: keyof Values,
        label: string,
        hint?: string,
        placeholder?: string,
        inputMode: "text" | "numeric" | "decimal" = "decimal",
        tip?: string,
    ) => (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <div className="flex items-center gap-1">
                        <FormLabel>{label}</FormLabel>
                        {tip ? <InfoTip>{tip}</InfoTip> : null}
                    </div>
                    <FormControl>
                        <Input
                            inputMode={inputMode}
                            placeholder={placeholder}
                            {...field}
                            value={field.value as string}
                        />
                    </FormControl>
                    {hint ? <FormDescription>{hint}</FormDescription> : null}
                    <FormMessage />
                </FormItem>
            )}
        />
    );

    return (
        <EditorSheet
            open={open}
            onOpenChange={(value) => !value && onClose()}
            title={plan ? `编辑套餐 #${plan.id}` : "新建套餐"}
            description={
                plan ? "修改仅对新订单生效，已售订单不受影响。" : undefined
            }
            formId="plan-form"
            submitLabel={plan ? "保存修改" : "创建套餐"}
            pending={save.isPending}
            error={save.error}
        >
            <Form {...form}>
                <form
                    id="plan-form"
                    className="space-y-group"
                    onSubmit={form.handleSubmit(submit)}
                >
                    {text("name", "名称", undefined, undefined, "text")}
                    <FormField
                        control={form.control}
                        name="content"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>描述</FormLabel>
                                <FormControl>
                                    <Textarea rows={3} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {text(
                        "transferGiB",
                        "流量额度（GB）",
                        undefined,
                        undefined,
                        "decimal",
                        "1 GB = 1024 MB",
                    )}
                    <FormField
                        control={form.control}
                        name="trafficResetMode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>流量重置方式</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                        aria-label="流量重置方式"
                                        value={field.value}
                                        onValueChange={field.onChange}
                                    >
                                        {trafficResetModeSchema.options.map(
                                            (mode) => (
                                                <label
                                                    key={mode}
                                                    className="flex items-center gap-inline text-sm"
                                                >
                                                    <RadioGroupItem
                                                        value={mode}
                                                    />
                                                    {RESET_MODES[mode]}
                                                </label>
                                            ),
                                        )}
                                    </RadioGroup>
                                </FormControl>
                                <FormDescription>
                                    按北京时间零点清零已用流量。每月重置时，额度按月使用。
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {text(
                        "trafficResetPrice",
                        "流量重置包价格（元）",
                        "留空时停售重置包。",
                    )}
                    <div className="grid grid-cols-2 gap-group">
                        {text("speedLimit", "限速（Mbps）", undefined, "不限")}
                        {text("deviceLimit", "设备数", undefined, "不限")}
                    </div>
                    <fieldset className="grid gap-field">
                        <legend className="mb-field text-sm leading-none font-medium">
                            价格（元）
                        </legend>
                        <div className="grid grid-cols-3 gap-group">
                            {PERIODS.map((period) => (
                                <div key={period}>
                                    {text(
                                        period,
                                        periodLabel(period),
                                        undefined,
                                        "不提供",
                                    )}
                                </div>
                            ))}
                        </div>
                    </fieldset>
                    {text(
                        "sort",
                        "排序",
                        "数值越小，排序越靠前。",
                        undefined,
                        "numeric",
                    )}
                    <FormField
                        control={form.control}
                        name="published"
                        render={({ field }) => (
                            <CheckRow
                                label="发布销售"
                                description="发布后，用户可查看并购买此套餐。"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                        )}
                    />
                </form>
            </Form>
        </EditorSheet>
    );
}

export function AdminPlans() {
    const list = usePanel<PlanRow[]>("/admin/plans");
    const editor = useEditorSearch("/admin/plans");
    const action = useCommand();
    const optimistic = useOptimisticRows<PlanRow>("/admin/plans");
    const [deleting, setDeleting] = useState<PlanRow | null>(null);
    const editing = list.data?.find((p) => p.id === editor.editId) ?? null;

    const columns: ColumnDef<PlanRow>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="套餐" />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <IconBlock size="sm">
                        <Package />
                    </IconBlock>
                    <div>
                        <p className="font-medium">{row.original.name}</p>
                        <p className="numeric text-xs text-muted-foreground">
                            #{row.original.id}
                        </p>
                    </div>
                </div>
            ),
            enableHiding: false,
            meta: { title: "套餐" },
        },
        {
            id: "status",
            accessorFn: (p) => (p.published ? "销售中" : "草稿"),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ row, getValue }) => (
                <div className="flex items-center gap-inline">
                    <Badge variant={PUBLISH_TONE[getValue<string>()]}>
                        {getValue<string>() === "销售中" ? (
                            <CircleCheck />
                        ) : (
                            <CircleDashed />
                        )}
                        {getValue<string>()}
                    </Badge>
                    <SaveStatus
                        state={optimistic.status(row.original.id)}
                        onRetry={() => optimistic.retry(row.original.id)}
                    />
                </div>
            ),
            filterFn: inFilter,
            meta: { title: "状态" },
        },
        {
            id: "traffic",
            accessorFn: (p) => Number(p.transferEnable),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="流量" />
            ),
            cell: ({ row }) => (
                <IconText icon={ArrowDownUp}>
                    <span>
                        {formatTraffic(row.original.transferEnable)}
                        <span className="block text-xs text-muted-foreground">
                            {RESET_MODES[row.original.trafficResetMode]}
                        </span>
                    </span>
                </IconText>
            ),
            meta: {
                title: "流量",
                exportValue: (p) => formatTraffic(p.transferEnable),
            },
        },
        {
            id: "limits",
            header: "限速 / 设备",
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-x-group gap-y-1">
                    <IconText icon={Gauge}>
                        {row.original.speedLimit
                            ? `${row.original.speedLimit} Mbps`
                            : "不限速"}
                    </IconText>
                    <IconText icon={MonitorSmartphone}>
                        {row.original.deviceLimit
                            ? `${row.original.deviceLimit} 台`
                            : "不限设备"}
                    </IconText>
                </div>
            ),
            meta: {
                title: "限速 / 设备",
                exportValue: (p) =>
                    `${p.speedLimit ?? "不限"} / ${p.deviceLimit ?? "不限"}`,
            },
        },
        {
            id: "prices",
            accessorFn: (p) =>
                p.prices.length
                    ? Math.min(...p.prices.map((x) => x.amountMinor))
                    : undefined,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="价格" />
            ),
            cell: ({ row }) =>
                row.original.prices.length ? (
                    <div className="numeric space-y-1 text-xs">
                        {row.original.prices.map((p) => (
                            <p key={p.period}>
                                <span className="text-muted-foreground">
                                    {periodLabel(p.period)}
                                </span>{" "}
                                {formatMinor(p.amountMinor)}
                            </p>
                        ))}
                    </div>
                ) : (
                    <Badge variant="warning">未定价</Badge>
                ),
            sortUndefined: "last",
            meta: {
                title: "价格",
                exportValue: (p) =>
                    p.prices
                        .map(
                            (x) =>
                                `${periodLabel(x.period)} ${minorToYuan(x.amountMinor)}`,
                        )
                        .join("; "),
            },
        },
        {
            accessorKey: "sort",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="排序" />
            ),
            cell: ({ row }) => (
                <span className="numeric text-muted-foreground">
                    {row.original.sort}
                </span>
            ),
            meta: { title: "排序" },
        },
        {
            id: "actions",
            enableHiding: false,
            cell: ({ row }) => (
                <RowActions
                    actions={[
                        {
                            label: "编辑",
                            icon: Pencil,
                            onSelect: () => editor.open(row.original.id),
                        },
                        {
                            label: row.original.published ? "下架" : "发布销售",
                            disabledReason: "请先设置价格",
                            icon: row.original.published ? EyeOff : Eye,
                            disabled:
                                !row.original.published &&
                                !row.original.prices.length,
                            onSelect: () =>
                                optimistic.change({
                                    id: row.original.id,
                                    fields: {
                                        published: !row.original.published,
                                    },
                                    path: `/admin/plans/${row.original.id}`,
                                    body: planBody(
                                        row.original,
                                        !row.original.published,
                                    ),
                                }),
                        },
                        "separator",
                        {
                            label: "删除",
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => setDeleting(row.original),
                        },
                    ]}
                />
            ),
            meta: { className: "w-12" },
        },
    ];

    return (
        <Page
            title="套餐"
            actions={
                <Button onClick={() => editor.open("new")}>
                    <Plus /> 新建套餐
                </Button>
            }
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                error={list.isError ? list.error : undefined}
                onRetry={() => list.refetch()}
                columns={columns}
                getRowId={(p) => String(p.id)}
                searchPlaceholder="套餐名称…"
                exportName="套餐"
                onRowClick={(p) => editor.open(p.id)}
                selectedRowId={editor.editId ? String(editor.editId) : null}
                emptyText={
                    <EmptyState
                        icon={Package}
                        title="暂无套餐"
                        description="创建套餐后，请在节点页面将节点关联至该套餐。"
                        action={
                            <Button onClick={() => editor.open("new")}>
                                <Plus /> 新建套餐
                            </Button>
                        }
                    />
                }
                initialSorting={[{ id: "sort", desc: false }]}
                filters={[
                    {
                        columnId: "status",
                        title: "状态",
                        options: ["销售中", "草稿"].map((v) => ({
                            value: v,
                            label: v,
                        })),
                    },
                ]}
            />
            <PlanSheet
                key={editing?.id ?? "new"}
                plan={editing}
                open={editor.isNew || editing !== null}
                onClose={() => editor.open(null)}
            />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`删除套餐“${deleting?.name ?? ""}”？`}
                desc="删除后用户将无法购买该套餐，节点关联将同步解除，历史订单保留。"
                confirmText="删除"
                destructive
                isLoading={action.isPending}
                handleConfirm={() =>
                    deleting &&
                    action.mutate(
                        {
                            path: `/admin/plans/${deleting.id}`,
                            method: "DELETE",
                        },
                        {
                            onSuccess: () => {
                                toast.success("套餐已删除");
                                if (editor.editId === deleting.id)
                                    editor.open(null);
                                setDeleting(null);
                            },
                        },
                    )
                }
            />
        </Page>
    );
}
