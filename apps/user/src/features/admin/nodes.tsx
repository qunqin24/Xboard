import { type ColumnDef } from "@tanstack/react-table";
import {
    Check,
    CircleDashed,
    Clock,
    Copy,
    Globe,
    KeyRound,
    Loader2,
    Network,
    Package,
    Pencil,
    Plus,
    Power,
    PowerOff,
    Server,
    Trash2,
    Wifi,
    WifiOff,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NODE_PROTOCOLS } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
    selectColumn,
} from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { IconBlock } from "@/components/ui/icon-block";
import { IconText } from "@/components/icon-text";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
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
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { useEditorSearch } from "./editor-search";
import { NodeSheet } from "./node-form";
import { nodeSummary, PROTOCOL_LABEL } from "./node-options";
import { NODE_STATE_TONE } from "./status";
import type { NodeRow, PlanRow } from "./types";
import { nodeState } from "./units";

const STATE_ICON = {
    在线: Wifi,
    离线: WifiOff,
    未连接: CircleDashed,
    已停用: PowerOff,
} satisfies Record<keyof typeof NODE_STATE_TONE, unknown>;

function TokenDialog({
    value,
    onClose,
}: {
    value: { id: number; token: string } | null;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const close = () => {
        setCopied(false);
        onClose();
    };
    return (
        <Dialog open={value !== null}>
            <DialogContent
                showCloseButton={false}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>节点 #{value?.id} 的通信密钥</DialogTitle>
                    <DialogDescription>
                        密钥仅显示一次，关闭后无法再次查看。请将其配置为节点后端的
                        ApiKey。
                    </DialogDescription>
                </DialogHeader>
                <div className="flex gap-inline">
                    <Input
                        readOnly
                        value={value?.token ?? ""}
                        onFocus={(e) => e.target.select()}
                        className="numeric"
                        aria-label="节点密钥"
                    />
                    <Button
                        variant="outline"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(
                                    value?.token ?? "",
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
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    对接说明
                    <InfoTip label="对接说明">
                        <span className="numeric break-all">
                            {location.origin}
                            /api/v1/server/UniProxy/config?node_id=
                            {value?.id}&node_type=…&token=…
                        </span>
                    </InfoTip>
                </div>
                <DialogFooter>
                    <Button onClick={close}>我已保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function AdminNodes() {
    const list = usePanel<NodeRow[]>("/admin/nodes");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const editor = useEditorSearch("/admin/nodes");
    const action = useCommand();
    const [token, setToken] = useState<{ id: number; token: string } | null>(
        null,
    );
    const [confirm, setConfirm] = useState<{
        kind: "rotate" | "delete" | "disable";
        node: NodeRow;
    } | null>(null);
    const [bulkPending, setBulkPending] = useState(false);
    const [bulkDisable, setBulkDisable] = useState<{
        rows: NodeRow[];
        clear: () => void;
    } | null>(null);
    const planName = new Map(plans.data?.map((p) => [p.id, p.name]));
    const byId = new Map(list.data?.map((n) => [n.id, n]));
    const editing = list.data?.find((n) => n.id === editor.editId) ?? null;

    const setEnabled = async (
        nodes: NodeRow[],
        enabled: boolean,
        clear: () => void,
    ) => {
        const targets = nodes.filter((node) => node.enabled !== enabled);
        let done = 0;
        setBulkPending(true);
        for (const node of targets) {
            try {
                await action.mutateAsync({
                    path: `/admin/nodes/${node.id}/enabled`,
                    method: "PUT",
                    body: { enabled },
                });
                done += 1;
            } catch {
                /* Each failure is already reported as a toast. */
            }
        }
        setBulkPending(false);
        if (done)
            toast.success(`已${enabled ? "启用" : "停用"} ${done} 个节点`);
        clear();
    };

    const columns: ColumnDef<NodeRow>[] = [
        selectColumn<NodeRow>(),
        {
            accessorKey: "name",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="节点" />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <IconBlock
                        size="sm"
                        tone={row.original.enabled ? "brand" : "neutral"}
                    >
                        <Server />
                    </IconBlock>
                    <div className="space-y-1">
                        <p className="font-medium">{row.original.name}</p>
                        <div className="flex flex-wrap items-center gap-1">
                            <span className="numeric text-xs text-muted-foreground">
                                #{row.original.id}
                            </span>
                            {row.original.parentId !== null ? (
                                <Badge variant="outline">
                                    中转 #{row.original.parentId}
                                </Badge>
                            ) : null}
                            {row.original.visible ? null : (
                                <Badge variant="secondary">不在订阅中</Badge>
                            )}
                            {row.original.tags.map((tag) => (
                                <Badge key={tag} variant="outline">
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>
            ),
            enableHiding: false,
            meta: { title: "节点" },
        },
        {
            id: "state",
            // A relay has no backend of its own: it is as online as its parent.
            accessorFn: (n) =>
                nodeState(
                    n.parentId === null
                        ? n
                        : {
                              ...n,
                              lastSeenAt:
                                  byId.get(n.parentId)?.lastSeenAt ?? null,
                          },
                ),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ getValue }) => {
                const value = getValue<keyof typeof NODE_STATE_TONE>();
                const Icon = STATE_ICON[value];
                return (
                    <Badge variant={NODE_STATE_TONE[value]}>
                        <Icon />
                        {value}
                    </Badge>
                );
            },
            filterFn: inFilter,
            meta: { title: "状态" },
        },
        {
            accessorKey: "protocol",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="协议" />
            ),
            cell: ({ row }) => {
                const source =
                    row.original.parentId === null
                        ? row.original
                        : byId.get(row.original.parentId);
                const summary = source ? nodeSummary(source) : "";
                return (
                    <div>
                        <IconText icon={Network}>
                            {PROTOCOL_LABEL[row.original.protocol]}
                        </IconText>
                        {summary ? (
                            <p className="text-xs text-muted-foreground">
                                {summary}
                            </p>
                        ) : null}
                    </div>
                );
            },
            filterFn: inFilter,
            meta: { title: "协议" },
        },
        {
            id: "address",
            accessorFn: (n) => `${n.host}:${n.port}`,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="地址" />
            ),
            cell: ({ getValue }) => (
                <IconText icon={Globe}>{getValue<string>()}</IconText>
            ),
            meta: { title: "地址" },
        },
        {
            id: "rate",
            accessorFn: (n) =>
                n.parentId === null
                    ? n.rate
                    : (byId.get(n.parentId)?.rate ?? 1),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="倍率" />
            ),
            cell: ({ row, getValue }) => {
                const source =
                    row.original.parentId === null
                        ? row.original
                        : byId.get(row.original.parentId);
                return (
                    <span className="numeric">
                        ×{getValue<number>()}
                        {source?.rateRanges.length ? (
                            <span className="text-muted-foreground"> 分时</span>
                        ) : null}
                    </span>
                );
            },
            meta: { title: "倍率" },
        },
        {
            id: "plans",
            accessorFn: (n) =>
                n.plans
                    .map((p) => planName.get(p.planId) ?? `#${p.planId}`)
                    .join("、"),
            header: "套餐",
            cell: ({ getValue }) =>
                getValue<string>() ? (
                    <IconText icon={Package} className="font-sans">
                        {getValue<string>()}
                    </IconText>
                ) : (
                    <Badge variant="warning">未关联</Badge>
                ),
            enableSorting: false,
            meta: { title: "套餐" },
        },
        {
            id: "lastSeenAt",
            accessorFn: (n) =>
                n.lastSeenAt ? Date.parse(n.lastSeenAt) : undefined,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="最近上报" />
            ),
            cell: ({ row }) =>
                row.original.lastSeenAt ? (
                    <IconText icon={Clock} className="text-muted-foreground">
                        {formatDateTime(row.original.lastSeenAt)}
                    </IconText>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
            sortUndefined: "last",
            meta: { title: "最近上报", exportValue: (n) => n.lastSeenAt ?? "" },
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
                            label: row.original.enabled ? "停用" : "启用",
                            icon: Power,
                            onSelect: () =>
                                row.original.enabled
                                    ? setConfirm({
                                          kind: "disable",
                                          node: row.original,
                                      })
                                    : action.mutate(
                                          {
                                              path: `/admin/nodes/${row.original.id}/enabled`,
                                              method: "PUT",
                                              body: { enabled: true },
                                          },
                                          {
                                              onSuccess: () =>
                                                  toast.success("节点已启用"),
                                          },
                                      ),
                        },
                        "separator",
                        ...(row.original.parentId === null
                            ? [
                                  {
                                      label: "重置密钥",
                                      icon: KeyRound,
                                      destructive: true,
                                      onSelect: () =>
                                          setConfirm({
                                              kind: "rotate",
                                              node: row.original,
                                          }),
                                  },
                              ]
                            : []),
                        {
                            label: "删除",
                            icon: Trash2,
                            destructive: true,
                            onSelect: () =>
                                setConfirm({
                                    kind: "delete",
                                    node: row.original,
                                }),
                        },
                    ]}
                />
            ),
            meta: { className: "w-12" },
        },
    ];

    return (
        <Page
            title="节点"
            help="兼容 UniProxy（V2bX）及 XrayR 的 V2board 旧版接口。支持 VLESS、VMess、Trojan（TLS / Reality，TCP、WebSocket、gRPC、HTTPUpgrade、XHTTP）、Shadowsocks、Hysteria2、Hysteria、TUIC、AnyTLS、SOCKS5、HTTP、Naive、Mieru。中转节点由父节点的后端提供服务。"
            actions={
                <Button onClick={() => editor.open("new")}>
                    <Plus /> 新建节点
                </Button>
            }
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                error={list.isError ? list.error : undefined}
                onRetry={() => void list.refetch()}
                columns={columns}
                getRowId={(n) => String(n.id)}
                searchPlaceholder="名称、地址…"
                exportName="节点"
                entityName="节点"
                onRowClick={(n) => editor.open(n.id)}
                selectedRowId={editor.editId ? String(editor.editId) : null}
                emptyText={
                    <EmptyState
                        icon={Server}
                        title="暂无节点"
                        description="创建节点后，将通信密钥配置到节点后端即可开始上报。"
                        action={
                            <Button onClick={() => editor.open("new")}>
                                <Plus /> 新建节点
                            </Button>
                        }
                    />
                }
                filters={[
                    {
                        columnId: "state",
                        title: "状态",
                        options: Object.keys(NODE_STATE_TONE).map((v) => ({
                            value: v,
                            label: v,
                        })),
                    },
                    {
                        columnId: "protocol",
                        title: "协议",
                        options: NODE_PROTOCOLS.map((p) => ({
                            value: p,
                            label: PROTOCOL_LABEL[p],
                        })),
                    },
                ]}
                bulkActions={(rows, clear) => (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkPending}
                            onClick={() => void setEnabled(rows, true, clear)}
                        >
                            {bulkPending ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <Power />
                            )}
                            启用
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkPending}
                            onClick={() => setBulkDisable({ rows, clear })}
                        >
                            <PowerOff />
                            停用
                        </Button>
                    </>
                )}
            />
            <NodeSheet
                key={editing?.id ?? "new"}
                node={editing}
                nodes={list.data ?? []}
                plans={plans.data ?? []}
                open={editor.isNew || editing !== null}
                onClose={() => editor.open(null)}
                onToken={setToken}
            />
            <TokenDialog value={token} onClose={() => setToken(null)} />
            <ConfirmDialog
                open={bulkDisable !== null}
                onOpenChange={(open) => !open && setBulkDisable(null)}
                title={`停用选中的 ${bulkDisable?.rows.length ?? 0} 个节点？`}
                desc="停用后，节点将无法获取用户列表，用户订阅中不再包含这些节点。"
                confirmText="停用"
                isLoading={bulkPending}
                handleConfirm={() => {
                    if (!bulkDisable) return;
                    const { rows, clear } = bulkDisable;
                    setBulkDisable(null);
                    void setEnabled(rows, false, clear);
                }}
            />
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={
                    confirm?.kind === "rotate"
                        ? `重置“${confirm.node.name}”的密钥？`
                        : confirm?.kind === "disable"
                          ? `停用节点“${confirm.node.name}”？`
                          : `删除节点“${confirm?.node.name ?? ""}”？`
                }
                desc={
                    confirm?.kind === "rotate"
                        ? "旧密钥立即失效。请将新密钥配置到节点后端，否则节点将断开上报。"
                        : confirm?.kind === "disable"
                          ? "停用后，节点将无法获取用户列表，用户订阅中不再包含该节点。"
                          : "节点将被停用并作废密钥，用户订阅中不再包含该节点；历史流量记录保留。"
                }
                confirmText={
                    confirm?.kind === "rotate"
                        ? "重置"
                        : confirm?.kind === "disable"
                          ? "停用"
                          : "删除"
                }
                destructive={confirm?.kind !== "disable"}
                isLoading={action.isPending}
                handleConfirm={() => {
                    if (!confirm) return;
                    const { kind, node } = confirm;
                    action.mutate(
                        kind === "rotate"
                            ? { path: `/admin/nodes/${node.id}/token` }
                            : kind === "disable"
                              ? {
                                    path: `/admin/nodes/${node.id}/enabled`,
                                    method: "PUT",
                                    body: { enabled: false },
                                }
                              : {
                                    path: `/admin/nodes/${node.id}`,
                                    method: "DELETE",
                                },
                        {
                            onSuccess: (result) => {
                                if (kind === "rotate")
                                    setToken({
                                        id: node.id,
                                        token: String(result.token),
                                    });
                                else if (kind === "disable")
                                    toast.success("节点已停用");
                                else {
                                    toast.success("节点已删除");
                                    if (editor.editId === node.id)
                                        editor.open(null);
                                }
                                setConfirm(null);
                            },
                        },
                    );
                }}
            />
        </Page>
    );
}
