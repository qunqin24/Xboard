import { Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useCommand, usePanel } from "../api/panel";
import { Checkbox, Feedback, Field, Form, TextArea } from "../components/forms";
import { Badge, Button, PageHeader } from "../components/primitives";
import { formatMinor, formatTraffic, periodLabel } from "../lib/format";
import { DataTable } from "./DataTable";
import {
    bytesToGiB,
    EditorPanel,
    giBToBytes,
    minorToYuan,
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
                        { onSuccess: onClose },
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

export function PlansPage() {
    const list = usePanel<PlanRow[]>("/admin/plans");
    const [editing, setEditing] = useState<PlanRow | "new" | null>(null);

    return (
        <div className="space-y-6">
            <PageHeader
                title="套餐"
                description="套餐决定流量、限速、设备数和价格。已下的订单保存当时的快照，修改不影响已售订单。"
                actions={
                    <Button onClick={() => setEditing("new")}>
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
                            onClose={() => setEditing(null)}
                        />
                    ) : null
                }
            >
                <DataTable
                    query={list}
                    rowKey={(row) => row.id}
                    selectedKey={
                        editing && editing !== "new" ? editing.id : null
                    }
                    onRowClick={setEditing}
                    empty={{
                        title: "还没有套餐",
                        description: "先创建套餐，再到节点页把节点关联到套餐。",
                    }}
                    columns={[
                        {
                            key: "name",
                            header: "套餐",
                            cell: (p) => (
                                <>
                                    <p className="font-medium">{p.name}</p>
                                    <p className="numeric text-xs text-ink-subtle">
                                        #{p.id} · 排序 {p.sort}
                                    </p>
                                </>
                            ),
                        },
                        {
                            key: "status",
                            header: "状态",
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
                            header: "流量 / 限制",
                            cell: (p) => (
                                <span className="numeric text-ink-muted">
                                    {formatTraffic(p.transferEnable)}
                                    {" · "}
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
                    ]}
                />
            </WithEditor>
        </div>
    );
}
