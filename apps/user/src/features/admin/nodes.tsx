import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { type ColumnDef } from "@tanstack/react-table";
import {
    Check,
    Copy,
    KeyRound,
    Loader2,
    Pencil,
    Plus,
    Power,
    PowerOff,
    Server,
    Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand, usePanel } from "@/api/panel";
import { CheckRow } from "@/components/check-row";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
    selectColumn,
} from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { useEditorSearch } from "./editor-search";
import { EditorSheet } from "./editor-sheet";
import { NODE_STATE_TONE } from "./status";
import type { NodeRow, PlanRow } from "./types";
import { nodeState } from "./units";

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

const schema = z.object({
    name: z.string().trim().min(1, "请输入名称").max(80, "名称最多 80 个字"),
    protocol: z.enum(PROTOCOLS),
    host: z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9.:[\]-]{1,253}$/, "请输入域名或 IP"),
    port: z
        .string()
        .regex(/^\d+$/, "请输入端口")
        .refine((v) => Number(v) >= 1 && Number(v) <= 65535, "1 到 65535"),
    serverName: z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9.-]{0,253}$/, "只能包含字母、数字、点和连字符"),
    cipher: z.enum(CIPHERS),
    enabled: z.boolean(),
    planIds: z.array(z.number()),
});

/** PUT body for a listed node, optionally flipping its enabled flag. */
const nodeBody = (node: NodeRow, enabled = node.enabled) => ({
    name: node.name,
    protocol: node.protocol,
    host: node.host,
    port: node.port,
    serverName: node.serverName,
    cipher: node.cipher,
    enabled,
    planIds: node.plans.map((p) => p.planId),
});

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

function NodeSheet({
    node,
    plans,
    open,
    onClose,
    onToken,
}: {
    node: NodeRow | null;
    plans: PlanRow[];
    open: boolean;
    onClose: () => void;
    onToken: (value: { id: number; token: string }) => void;
}) {
    const save = useCommand();
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        values: {
            name: node?.name ?? "",
            protocol: (node?.protocol as (typeof PROTOCOLS)[number]) ?? "vless",
            host: node?.host ?? "",
            port: String(node?.port ?? 443),
            serverName: node?.serverName ?? "",
            cipher: (node?.cipher as (typeof CIPHERS)[number]) ?? CIPHERS[0],
            enabled: node?.enabled ?? true,
            planIds: node?.plans.map((p) => p.planId) ?? [],
        },
    });
    // Opening the sheet starts from the saved values (or a blank "new"
    // form), never from a draft left by the previous open.
    useEffect(() => {
        if (open) form.reset();
    }, [open, form]);
    const protocol = form.watch("protocol");

    return (
        <EditorSheet
            open={open}
            onOpenChange={(value) => !value && onClose()}
            title={node ? `编辑节点 #${node.id}` : "新建节点"}
            description={node ? node.name : undefined}
            formId="node-form"
            submitLabel={node ? "保存修改" : "创建节点"}
            pending={save.isPending}
        >
            <Form {...form}>
                <form
                    id="node-form"
                    className="space-y-group"
                    onSubmit={form.handleSubmit((v) =>
                        save.mutate(
                            {
                                path: node
                                    ? `/admin/nodes/${node.id}`
                                    : "/admin/nodes",
                                method: node ? "PUT" : "POST",
                                body: { ...v, port: Number(v.port) },
                            },
                            {
                                onSuccess: (result) => {
                                    if (typeof result.token === "string")
                                        onToken({
                                            id: Number(result.id),
                                            token: result.token,
                                        });
                                    toast.success(
                                        node ? "节点已保存" : "节点已创建",
                                    );
                                    onClose();
                                },
                            },
                        ),
                    )}
                >
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>名称</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="protocol"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>协议</FormLabel>
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
                                        {PROTOCOLS.map((p) => (
                                            <SelectItem key={p} value={p}>
                                                {p}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-4 gap-group">
                        <FormField
                            control={form.control}
                            name="host"
                            render={({ field }) => (
                                <FormItem className="col-span-3">
                                    <FormLabel>地址</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="node.example.com"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="port"
                            render={({ field }) => (
                                <FormItem className="col-span-1">
                                    <FormLabel>端口</FormLabel>
                                    <FormControl>
                                        <Input inputMode="numeric" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <FormField
                        control={form.control}
                        name="serverName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>TLS 服务器名称（SNI）</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormDescription>
                                    默认与地址相同
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {protocol === "shadowsocks" ? (
                        <FormField
                            control={form.control}
                            name="cipher"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>加密方式</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            className="gap-field"
                                        >
                                            {CIPHERS.map((c) => (
                                                <label
                                                    key={c}
                                                    className="flex items-center gap-inline text-sm"
                                                >
                                                    <RadioGroupItem value={c} />
                                                    <span className="numeric">
                                                        {c}
                                                    </span>
                                                </label>
                                            ))}
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ) : null}
                    <FormField
                        control={form.control}
                        name="planIds"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>可使用的套餐</FormLabel>
                                <div className="grid gap-field">
                                    {plans.length ? (
                                        plans.map((plan) => (
                                            <label
                                                key={plan.id}
                                                className="flex items-center gap-inline text-sm"
                                            >
                                                <Checkbox
                                                    checked={field.value.includes(
                                                        plan.id,
                                                    )}
                                                    onCheckedChange={(
                                                        checked,
                                                    ) =>
                                                        field.onChange(
                                                            checked
                                                                ? [
                                                                      ...field.value,
                                                                      plan.id,
                                                                  ]
                                                                : field.value.filter(
                                                                      (id) =>
                                                                          id !==
                                                                          plan.id,
                                                                  ),
                                                        )
                                                    }
                                                />
                                                {plan.name}
                                                {plan.published ? null : (
                                                    <Badge variant="outline">
                                                        未发布
                                                    </Badge>
                                                )}
                                            </label>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            暂无套餐，请先
                                            <Link
                                                to="/admin/plans"
                                                search={{ new: true }}
                                                className="text-foreground underline underline-offset-4"
                                            >
                                                创建套餐
                                            </Link>
                                            。
                                        </p>
                                    )}
                                </div>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="enabled"
                        render={({ field }) => (
                            <CheckRow
                                label="启用节点"
                                description="停用后，节点将无法获取用户列表。"
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
                    path: `/admin/nodes/${node.id}`,
                    method: "PUT",
                    body: nodeBody(node, enabled),
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
                <div>
                    <p className="font-medium">{row.original.name}</p>
                    <p className="numeric text-xs text-muted-foreground">
                        #{row.original.id}
                    </p>
                </div>
            ),
            enableHiding: false,
            meta: { title: "节点" },
        },
        {
            id: "state",
            accessorFn: (n) => nodeState(n),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ getValue }) => {
                const value = getValue<keyof typeof NODE_STATE_TONE>();
                return <Badge variant={NODE_STATE_TONE[value]}>{value}</Badge>;
            },
            filterFn: inFilter,
            meta: { title: "状态" },
        },
        {
            accessorKey: "protocol",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="协议" />
            ),
            cell: ({ row }) => (
                <span className="numeric">{row.original.protocol}</span>
            ),
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
                <span className="numeric text-muted-foreground">
                    {getValue<string>()}
                </span>
            ),
            meta: { title: "地址" },
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
                    <span className="text-muted-foreground">
                        {getValue<string>()}
                    </span>
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
            cell: ({ row }) => (
                <span className="numeric text-muted-foreground">
                    {formatDateTime(row.original.lastSeenAt)}
                </span>
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
                                              path: `/admin/nodes/${row.original.id}`,
                                              method: "PUT",
                                              body: nodeBody(
                                                  row.original,
                                                  true,
                                              ),
                                          },
                                          {
                                              onSuccess: () =>
                                                  toast.success("节点已启用"),
                                          },
                                      ),
                        },
                        "separator",
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
            help="兼容 UniProxy（V2bX）及 XrayR 的 V2board 旧版接口。支持协议：VMess、VLESS、Trojan（TCP + TLS）、Shadowsocks（AEAD）、Hysteria2、TUIC。"
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
                        options: PROTOCOLS.map((p) => ({ value: p, label: p })),
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
                                    path: `/admin/nodes/${node.id}`,
                                    method: "PUT",
                                    body: nodeBody(node, false),
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
