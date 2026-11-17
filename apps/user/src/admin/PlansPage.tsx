import {
    Eye,
    EyeSlash,
    PencilSimple,
    Plus,
    Trash,
} from "@phosphor-icons/react";
import { useCommand, usePanel } from "../api/panel";
import { Checkbox, Feedback, Field, Form, TextArea } from "../components/forms";
import { useToast } from "../components/overlays";
import { Badge, Button, PageHeader } from "../components/primitives";
import { formatMinor, formatTraffic, periodLabel } from "../lib/format";
import { DataTable } from "./DataTable";
import {
    bytesToGiB,
    EditorPanel,
    giBToBytes,
    minorToYuan,
    useAdminAction,
    useEditorParam,
    WithEditor,
    yuanToMinor,
} from "./Editor";
import type { PlanRow } from "./types";

const PERIODS = ["monthly", "quarterly", "yearly"] as const;
const optional = (value: FormDataEntryValue | null) =>
    value ? Number(value) : null;

function PlanEditor({
    plan,
    onClose,
}: {
    plan: PlanRow | null;
    onClose: () => void;
}) {
    const action = useCommand();
    const toast = useToast();
    return (
        <EditorPanel
            title={plan ? `编辑套餐` : "新建套餐"}
            description={
                plan
                    ? `#${plan.id} ${plan.name}`
                    : "草稿不对用户展示，勾选发布后开始销售。"
            }
            onClose={onClose}
        >
            <Form
                key={plan?.id ?? "new"}
                busy={action.isPending}
                label={plan ? "保存修改" : "创建套餐"}
                secondary={
                    <Button variant="quiet" onClick={onClose}>
                        取消
                    </Button>
                }
                submit={(form) =>
                    action.mutate(
                        {
                            path: plan
                                ? `/admin/plans/${plan.id}`
                                : "/admin/plans",
                            method: plan ? "PUT" : "POST",
                            body: {
                                name: form.get("name"),
                                content: form.get("content"),
                                transferBytes: giBToBytes(
                                    form.get("transferGiB"),
                                ),
                                speedLimit: optional(form.get("speedLimit")),
                                deviceLimit: optional(form.get("deviceLimit")),
                                published: form.has("published"),
                                sort: Number(form.get("sort")),
                                prices: PERIODS.filter(
                                    (period) => form.get(period) !== "",
                                ).map((period) => ({
                                    period,
                                    amountMinor: yuanToMinor(form.get(period)),
                                })),
                            },
                        },
                        {
                            onSuccess: () => {
                                toast.success(
                                    plan ? "套餐已保存" : "套餐已创建",
                                );
                                onClose();
                            },
                        },
                    )
                }
            >
                <Field
                    label="名称"
                    name="name"
                    defaultValue={plan?.name}
                    maxLength={80}
                    required
                />
                <TextArea
                    label="描述"
                    name="content"
                    rows={3}
                    defaultValue={plan?.content ?? ""}
                    required={false}
                />
                <Field
                    label="周期总流量"
                    hint="GB，按 1024 进制"
                    name="transferGiB"
                    type="number"
                    min={0.01}
                    max={900000}
                    step={0.01}
                    defaultValue={
                        plan ? bytesToGiB(plan.transferEnable) : "100"
                    }
                    required
                />
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="限速"
                        hint="Mbps，空为不限"
                        name="speedLimit"
                        type="number"
                        min={1}
                        max={100000}
                        defaultValue={plan?.speedLimit ?? ""}
                    />
                    <Field
                        label="设备数"
                        hint="空为不限"
                        name="deviceLimit"
                        type="number"
                        min={1}
                        max={1000}
                        defaultValue={plan?.deviceLimit ?? ""}
                    />
                </div>
                <fieldset>
                    <legend className="mb-1.5 text-xs font-medium text-ink">
                        价格（元）
                        <span className="ml-2 font-normal text-ink-subtle">
                            留空表示不提供该周期
                        </span>
                    </legend>
                    <div className="grid grid-cols-3 gap-3">
                        {PERIODS.map((period) => {
                            const price = plan?.prices.find(
                                (p) => p.period === period,
                            );
                            return (
                                <Field
                                    key={period}
                                    label={periodLabel(period)}
                                    name={period}
                                    type="number"
                                    min={0}
                                    max={1000000}
                                    step={0.01}
                                    defaultValue={
                                        price
                                            ? minorToYuan(price.amountMinor)
                                            : ""
                                    }
                                />
                            );
                        })}
                    </div>
                </fieldset>
                <Field
                    label="排序"
                    hint="数字小的靠前"
                    name="sort"
                    type="number"
                    min={0}
                    defaultValue={plan?.sort ?? 0}
                    required
                />
                <Checkbox
                    name="published"
                    defaultChecked={plan?.published}
                    label="发布销售"
                    description="发布后用户可以看到并下单。"
                />
            </Form>
            <Feedback error={action.error} />
        </EditorPanel>
    );
}

/** Request body for PUT /admin/plans/:id built from a listed plan. */
const planBody = (plan: PlanRow, published = plan.published) => ({
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

export function PlansPage() {
    const list = usePanel<PlanRow[]>("/admin/plans");
    const editor = useEditorParam("/admin/plans");
    const action = useAdminAction();
    const editing = editor.isNew
        ? "new"
        : (list.data?.find((plan) => plan.id === editor.editId) ?? null);

    return (
        <div className="space-y-6">
            <PageHeader
                title="套餐"
                description="套餐决定流量、限速、设备数和价格。已下的订单保存当时的快照，修改不影响已售订单。"
                actions={
                    <Button onClick={() => editor.open("new")}>
                        <Plus aria-hidden className="size-4" />
                        新建套餐
                    </Button>
                }
            />
            <WithEditor
                editor={
                    editing ? (
                        <PlanEditor
                            plan={editing === "new" ? null : editing}
                            onClose={() => editor.open(null)}
                        />
                    ) : null
                }
            >
                <DataTable
                    id="plans"
                    exportName="套餐"
                    query={list}
                    rowKey={(row) => row.id}
                    selectedKey={
                        editing && editing !== "new" ? editing.id : null
                    }
                    onRowClick={(plan) => editor.open(plan.id)}
                    empty={{
                        title: "还没有套餐",
                        description: "先创建套餐，再到节点页把节点关联到套餐。",
                    }}
                    searchText={(p) => `${p.id} ${p.name} ${p.content ?? ""}`}
                    searchPlaceholder="套餐名称"
                    facets={[
                        {
                            key: "status",
                            label: "状态",
                            value: (p) => (p.published ? "published" : "draft"),
                            labels: { published: "销售中", draft: "草稿" },
                        },
                    ]}
                    rowActions={(plan) => [
                        {
                            label: "编辑",
                            icon: PencilSimple,
                            onSelect: () => editor.open(plan.id),
                        },
                        {
                            label: plan.published ? "下架" : "发布销售",
                            icon: plan.published ? EyeSlash : Eye,
                            disabled: !plan.published && !plan.prices.length,
                            hint:
                                !plan.published && !plan.prices.length
                                    ? "未定价"
                                    : undefined,
                            onSelect: () =>
                                void action.run({
                                    path: `/admin/plans/${plan.id}`,
                                    method: "PUT",
                                    body: planBody(plan, !plan.published),
                                    success: plan.published
                                        ? "已下架"
                                        : "已发布",
                                }),
                        },
                        { separator: true },
                        {
                            label: "删除",
                            icon: Trash,
                            tone: "danger",
                            onSelect: async () => {
                                const done = await action.run({
                                    path: `/admin/plans/${plan.id}`,
                                    method: "DELETE",
                                    success: "套餐已删除",
                                    confirm: {
                                        title: `删除套餐“${plan.name}”？`,
                                        description:
                                            "删除后用户不能再购买，节点也不再关联它；已有订单记录保留。仍有有效订阅时无法删除。",
                                        confirmLabel: "删除",
                                        tone: "danger",
                                    },
                                });
                                if (done && editor.editId === plan.id)
                                    editor.open(null);
                            },
                        },
                    ]}
                    columns={[
                        {
                            key: "name",
                            header: "套餐",
                            hideable: false,
                            sortValue: (p) => p.name,
                            cell: (p) => (
                                <>
                                    <p className="font-medium">{p.name}</p>
                                    <p className="numeric text-xs text-ink-subtle">
                                        #{p.id}
                                    </p>
                                </>
                            ),
                        },
                        {
                            key: "status",
                            header: "状态",
                            sortValue: (p) => p.published,
                            exportValue: (p) =>
                                p.published ? "销售中" : "草稿",
                            cell: (p) =>
                                p.published ? (
                                    <Badge dot tone="success">
                                        销售中
                                    </Badge>
                                ) : (
                                    <Badge dot>草稿</Badge>
                                ),
                        },
                        {
                            key: "traffic",
                            header: "流量",
                            sortValue: (p) => BigInt(p.transferEnable),
                            exportValue: (p) => formatTraffic(p.transferEnable),
                            cell: (p) => (
                                <span className="numeric">
                                    {formatTraffic(p.transferEnable)}
                                </span>
                            ),
                        },
                        {
                            key: "limits",
                            header: "限速 / 设备",
                            exportValue: (p) =>
                                `${p.speedLimit ? `${p.speedLimit} Mbps` : "不限速"} / ${p.deviceLimit ?? "不限"}`,
                            cell: (p) => (
                                <span className="numeric text-ink-muted">
                                    {p.speedLimit
                                        ? `${p.speedLimit} Mbps`
                                        : "不限速"}
                                    {" · "}
                                    {p.deviceLimit
                                        ? `${p.deviceLimit} 台`
                                        : "不限设备"}
                                </span>
                            ),
                        },
                        {
                            key: "prices",
                            header: "价格",
                            align: "right",
                            sortValue: (p) =>
                                p.prices.length
                                    ? Math.min(
                                          ...p.prices.map(
                                              (price) => price.amountMinor,
                                          ),
                                      )
                                    : null,
                            exportValue: (p) =>
                                p.prices
                                    .map(
                                        (price) =>
                                            `${periodLabel(price.period)} ${(price.amountMinor / 100).toFixed(2)}`,
                                    )
                                    .join("; "),
                            cell: (p) =>
                                p.prices.length ? (
                                    <div className="numeric space-y-0.5 text-xs">
                                        {p.prices.map((price) => (
                                            <p key={price.period}>
                                                <span className="text-ink-muted">
                                                    {periodLabel(price.period)}
                                                </span>{" "}
                                                {formatMinor(price.amountMinor)}
                                            </p>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-xs text-warn">
                                        未定价
                                    </span>
                                ),
                        },
                        {
                            key: "sort",
                            header: "排序",
                            align: "right",
                            sortValue: (p) => p.sort,
                            cell: (p) => (
                                <span className="numeric text-ink-muted">
                                    {p.sort}
                                </span>
                            ),
                        },
                    ]}
                />
            </WithEditor>
        </div>
    );
}
