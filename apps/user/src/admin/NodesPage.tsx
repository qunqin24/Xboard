import { Check, Copy, Key, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useCommand, usePanel } from "../api/panel";
import {
    Checkbox,
    Feedback,
    Field,
    Form,
    inputClass,
    Select,
} from "../components/forms";
import { Badge, Button, Card, PageHeader } from "../components/primitives";
import { formatDateTime } from "../lib/format";
import { DataTable } from "./DataTable";
import { EditorPanel, WithEditor } from "./Editor";
import type { NodeRow, PlanRow } from "./types";

const PROTOCOLS = [
    "vless",
    "vmess",
    "trojan",
    "shadowsocks",
    "hysteria2",
    "tuic",
] as const;
const CIPHERS = [
    "aes-128-gcm",
    "aes-256-gcm",
    "chacha20-ietf-poly1305",
] as const;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export function nodeState(node: NodeRow, now = Date.now()) {
    if (!node.enabled) return { label: "已停用", tone: "neutral" } as const;
    if (!node.lastSeenAt) return { label: "未连接", tone: "warn" } as const;
    return now - Date.parse(node.lastSeenAt) < ONLINE_WINDOW_MS
        ? ({ label: "在线", tone: "success" } as const)
        : ({ label: "离线", tone: "danger" } as const);
}

function TokenCard({
    id,
    token,
    onDismiss,
}: {
    id: number;
    token: string;
    onDismiss: () => void;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <Card className="border-signal/30 bg-signal-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-signal">
                        <Key aria-hidden className="size-4" />
                        节点 #{id} 的通信密钥
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                        只显示这一次。填入节点后端的 ApiKey /
                        Key，离开页面后无法再查看。
                    </p>
                </div>
                <Button variant="quiet" size="sm" onClick={onDismiss}>
                    我已保存
                </Button>
            </div>
            <div className="mt-3 flex gap-2">
                <input
                    readOnly
                    value={token}
                    aria-label="节点密钥"
                    onFocus={(e) => e.target.select()}
                    className={`${inputClass} numeric`}
                />
                <Button
                    variant="secondary"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(token);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                        } catch {
                            /* The field stays selectable for manual copy. */
                        }
                    }}
                >
                    {copied ? (
                        <Check aria-hidden className="size-4 text-signal" />
                    ) : (
                        <Copy aria-hidden className="size-4" />
                    )}
                    {copied ? "已复制" : "复制"}
                </Button>
            </div>
            <p className="numeric mt-3 break-all text-xs text-ink-muted">
                {location.origin}/api/v1/server/UniProxy/config?node_id={id}
                &amp;node_type=…&amp;token=…
            </p>
        </Card>
    );
}

function NodeEditor({
    node,
    plans,
    onClose,
    onToken,
}: {
    node: NodeRow | null;
    plans: PlanRow[];
    onClose: () => void;
    onToken: (value: { id: number; token: string }) => void;
}) {
    const action = useCommand();
    const rotate = useCommand();
    const [protocol, setProtocol] = useState(node?.protocol ?? "vless");

    return (
        <EditorPanel
            title={node ? "编辑节点" : "新建节点"}
            description={
                node
                    ? `#${node.id} ${node.name}`
                    : "创建后会生成一次性显示的通信密钥。"
            }
            onClose={onClose}
        >
            <Form
                key={node?.id ?? "new"}
                busy={action.isPending}
                label={node ? "保存修改" : "创建节点"}
                secondary={
                    <Button variant="quiet" onClick={onClose}>
                        取消
                    </Button>
                }
                submit={(form) =>
                    action.mutate(
                        {
                            path: node
                                ? `/admin/nodes/${node.id}`
                                : "/admin/nodes",
                            method: node ? "PUT" : "POST",
                            body: {
                                name: form.get("name"),
                                protocol: form.get("protocol"),
                                host: form.get("host"),
                                port: Number(form.get("port")),
                                serverName: form.get("serverName"),
                                cipher:
                                    form.get("cipher") ??
                                    node?.cipher ??
                                    CIPHERS[0],
                                enabled: form.has("enabled"),
                                planIds: form.getAll("planIds").map(Number),
                            },
                        },
                        {
                            onSuccess: (result) => {
                                if (typeof result.token === "string")
                                    onToken({
                                        id: Number(result.id),
                                        token: result.token,
                                    });
                                onClose();
                            },
                        },
                    )
                }
            >
                <Field
                    label="名称"
                    name="name"
                    defaultValue={node?.name}
                    required
                    maxLength={80}
                />
                <Select
                    label="协议"
                    name="protocol"
                    options={PROTOCOLS}
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value)}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
                    <Field
                        label="地址"
                        hint="域名或 IP"
                        name="host"
                        defaultValue={node?.host}
                        required
                    />
                    <Field
                        label="端口"
                        name="port"
                        type="number"
                        min={1}
                        max={65535}
                        defaultValue={node?.port ?? 443}
                        required
                    />
                </div>
                <Field
                    label="TLS Server Name"
                    hint="留空则使用地址"
                    name="serverName"
                    defaultValue={node?.serverName}
                />
                {protocol === "shadowsocks" ? (
                    <Select
                        label="加密方式"
                        name="cipher"
                        options={CIPHERS}
                        defaultValue={node?.cipher ?? CIPHERS[0]}
                    />
                ) : null}
                <fieldset className="rounded-md border border-line p-3">
                    <legend className="px-1 text-xs font-medium text-ink">
                        可使用的套餐
                    </legend>
                    {plans.length ? (
                        <div className="space-y-2">
                            {plans.map((plan) => (
                                <Checkbox
                                    key={plan.id}
                                    name="planIds"
                                    value={plan.id}
                                    label={plan.name}
                                    defaultChecked={node?.plans.some(
                                        (p) => p.planId === plan.id,
                                    )}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-ink-muted">还没有套餐。</p>
                    )}
                </fieldset>
                <Checkbox
                    name="enabled"
                    defaultChecked={node?.enabled ?? true}
                    label="启用节点"
                    description="停用后节点拉取不到用户。"
                />
            </Form>
            <Feedback error={action.error} />

            {node ? (
                <div className="mt-6 border-t border-line-subtle pt-5">
                    <p className="text-sm font-medium text-ink">重置通信密钥</p>
                    <p className="mt-1 text-xs text-ink-muted">
                        旧密钥立即失效，节点在更新配置前会断开上报。
                    </p>
                    <Button
                        className="mt-3"
                        variant="danger"
                        busy={rotate.isPending}
                        onClick={() => {
                            if (!confirm(`确定重置节点 #${node.id} 的密钥吗？`))
                                return;
                            rotate.mutate(
                                { path: `/admin/nodes/${node.id}/token` },
                                {
                                    onSuccess: (result) =>
                                        onToken({
                                            id: node.id,
                                            token: String(result.token),
                                        }),
                                },
                            );
                        }}
                    >
                        重置密钥
                    </Button>
                    <Feedback error={rotate.error} />
                </div>
            ) : null}
        </EditorPanel>
    );
}

export function NodesPage() {
    const list = usePanel<NodeRow[]>("/admin/nodes");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const [editing, setEditing] = useState<NodeRow | "new" | null>(null);
    const [token, setToken] = useState<{ id: number; token: string } | null>(
        null,
    );
    const planName = new Map(plans.data?.map((p) => [p.id, p.name]));

    return (
        <div className="space-y-6">
            <PageHeader
                title="节点"
                description="支持 UniProxy（V2bX）与 XrayR 旧 V2board 接口；TCP + TLS 的 VMess / VLESS / Trojan、AEAD Shadowsocks、Hysteria2、TUIC。"
                actions={
                    <Button onClick={() => setEditing("new")}>
                        <Plus aria-hidden className="size-4" />
                        新建节点
                    </Button>
                }
            />
            {token ? (
                <TokenCard {...token} onDismiss={() => setToken(null)} />
            ) : null}
            <WithEditor
                editor={
                    editing ? (
                        <NodeEditor
                            key={editing === "new" ? "new" : editing.id}
                            node={editing === "new" ? null : editing}
                            plans={plans.data ?? []}
                            onClose={() => setEditing(null)}
                            onToken={setToken}
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
                        title: "还没有节点",
                        description:
                            "新建节点后，把生成的密钥填到节点后端即可开始上报。",
                    }}
                    columns={[
                        {
                            key: "name",
                            header: "节点",
                            cell: (n) => (
                                <>
                                    <p className="font-medium">{n.name}</p>
                                    <p className="numeric text-xs text-ink-subtle">
                                        #{n.id} · {n.protocol}
                                    </p>
                                </>
                            ),
                        },
                        {
                            key: "state",
                            header: "状态",
                            cell: (n) => {
                                const state = nodeState(n);
                                return (
                                    <Badge dot tone={state.tone}>
                                        {state.label}
                                    </Badge>
                                );
                            },
                        },
                        {
                            key: "address",
                            header: "地址",
                            cell: (n) => (
                                <span className="numeric text-ink-muted">
                                    {n.host}:{n.port}
                                </span>
                            ),
                        },
                        {
                            key: "plans",
                            header: "套餐",
                            cell: (n) =>
                                n.plans.length ? (
                                    <span className="text-ink-muted">
                                        {n.plans
                                            .map(
                                                (p) =>
                                                    planName.get(p.planId) ??
                                                    `#${p.planId}`,
                                            )
                                            .join("、")}
                                    </span>
                                ) : (
                                    <span className="text-xs text-warn">
                                        未关联
                                    </span>
                                ),
                        },
                        {
                            key: "seen",
                            header: "最近上报",
                            align: "right",
                            cell: (n) => (
                                <span className="numeric text-ink-muted">
                                    {formatDateTime(n.lastSeenAt)}
                                </span>
                            ),
                        },
                    ]}
                />
            </WithEditor>
        </div>
    );
}
