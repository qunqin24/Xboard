import { zodResolver } from "@hookform/resolvers/zod";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
} from "@/components/data-table";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMinor, formatTraffic, periodLabel } from "@/lib/format";
import { useEditorSearch } from "./editor-search";
import { EditorSheet } from "./editor-sheet";
import type { PlanRow } from "./types";
import { bytesToGiB, giBToBytes, minorToYuan, yuanToMinor } from "./units";

const PERIODS = ["monthly", "quarterly", "yearly"] as const;
const money = z.string().regex(/^(\d{1,7}(\.\d{1,2})?)?$/, "最多两位小数");
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
        speedLimit: optionalInt(100000),
        deviceLimit: optionalInt(1000),
        monthly: money,
        quarterly: money,
        yearly: money,
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
    const save = useCommand();
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
            speedLimit: plan?.speedLimit ? String(plan.speedLimit) : "",
            deviceLimit: plan?.deviceLimit ? String(plan.deviceLimit) : "",
            monthly: price("monthly"),
            quarterly: price("quarterly"),
            yearly: price("yearly"),
            sort: String(plan?.sort ?? 0),
            published: plan?.published ?? false,
        },
    });

    const submit = (v: Values) =>
        save.mutate(
            {
                path: plan ? `/admin/plans/${plan.id}` : "/admin/plans",
                method: plan ? "PUT" : "POST",
                body: {
                    name: v.name,
                    content: v.content,
                    transferBytes: giBToBytes(v.transferGiB),
                    speedLimit: v.speedLimit ? Number(v.speedLimit) : null,
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
    ) => (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <Input
                            inputMode="decimal"
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
            description="已下的订单保存当时的快照，修改不影响已售订单。"
            formId="plan-form"
            submitLabel={plan ? "保存修改" : "创建套餐"}
            pending={save.isPending}
        >
            <Form {...form}>
                <form
                    id="plan-form"
                    className="space-y-5"
                    onSubmit={form.handleSubmit(submit)}
                >
                    {text("name", "名称")}
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
                        "周期总流量（GB）",
                        "按 1024 进制，整个周期的总额度。",
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        {text("speedLimit", "限速（Mbps）", undefined, "不限")}
                        {text("deviceLimit", "设备数", undefined, "不限")}
                    </div>
                    <div>
                        <p className="mb-2 text-sm font-medium">价格（元）</p>
                        <div className="grid grid-cols-3 gap-3">
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
                        <p className="mt-2 text-xs text-muted-foreground">
                            留空表示不提供该付款周期。
                        </p>
                    </div>
                    {text("sort", "排序", "数字小的排在前面。")}
                    <FormField
                        control={form.control}
                        name="published"
                        render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <FormLabel>发布销售</FormLabel>
                                    <FormDescription>
                                        发布后用户可以看到并下单。
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                            </FormItem>
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
    const [deleting, setDeleting] = useState<PlanRow | null>(null);
    const editing = list.data?.find((p) => p.id === editor.editId) ?? null;

    const columns: ColumnDef<PlanRow>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="套餐" />
            ),
            cell: ({ row }) => (
                <div>
                    <p className="font-medium">{row.original.name}</p>
                    <p className="numeric text-xs text-muted-foreground">
                        #{row.original.id}
                    </p>
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
            cell: ({ getValue }) => (
                <Badge
                    variant={getValue() === "销售中" ? "default" : "secondary"}
                >
                    {getValue<string>()}
                </Badge>
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
                <span className="numeric">
                    {formatTraffic(row.original.transferEnable)}
                </span>
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
                <span className="numeric text-muted-foreground">
                    {row.original.speedLimit
                        ? `${row.original.speedLimit} Mbps`
                        : "不限速"}{" "}
                    ·{" "}
                    {row.original.deviceLimit
                        ? `${row.original.deviceLimit} 台`
                        : "不限设备"}
                </span>
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
                    <div className="numeric space-y-0.5 text-xs">
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
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                        未定价
                    </span>
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
                            icon: row.original.published ? EyeOff : Eye,
                            disabled:
                                !row.original.published &&
                                !row.original.prices.length,
                            onSelect: () =>
                                action.mutate(
                                    {
                                        path: `/admin/plans/${row.original.id}`,
                                        method: "PUT",
                                        body: planBody(
                                            row.original,
                                            !row.original.published,
                                        ),
                                    },
                                    {
                                        onSuccess: () =>
                                            toast.success(
                                                row.original.published
                                                    ? "已下架"
                                                    : "已发布",
                                            ),
                                    },
                                ),
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
            description="套餐决定流量、限速、设备数和价格。"
            actions={
                <Button onClick={() => editor.open("new")}>
                    <Plus /> 新建套餐
                </Button>
            }
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                columns={columns}
                getRowId={(p) => String(p.id)}
                searchPlaceholder="套餐名称…"
                exportName="套餐"
                onRowClick={(p) => editor.open(p.id)}
                selectedRowId={editor.editId ? String(editor.editId) : null}
                emptyText="还没有套餐。先创建套餐，再到节点页把节点关联到套餐。"
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
                desc="删除后用户不能再购买，节点也不再关联它；已有订单记录保留。仍有有效订阅时无法删除，请先下架。"
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
