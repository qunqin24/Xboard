import { useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreatedOpsToken, OpsTokenInfo } from "@xboard/contracts";
import { Plus, ShieldOff } from "lucide-react";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Page } from "@/components/layout/page";
import { LongText } from "@/components/long-text";
import { SecretDialog } from "@/components/secret-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { EditorSheet } from "./editor-sheet";

const TOKEN_PATH = "/admin/ops-tokens";
const SCOPE_LABELS = {
    "*": "全部权限",
    "admin:read": "只读",
    "admin:write": "仅写",
};

function TokenEditor({
    close,
    onToken,
}: {
    close: () => void;
    onToken: (token: string) => void;
}) {
    const issue = useCommand<CreatedOpsToken>({ inline: true });
    const [scope, setScope] = useState("*");
    // datetime-local takes a wall-clock time. Use Beijing time as on the rest of the panel.
    const expiresAt = new Date(Date.now() + (30 * 24 + 8) * 3_600_000)
        .toISOString()
        .slice(0, 16);

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const expiration = new Date(`${String(fields.get("expiresAt"))}+08:00`);
        issue.mutate(
            {
                path: TOKEN_PATH,
                body: {
                    name: fields.get("name"),
                    expiresAt: expiration.toISOString(),
                    allowedIps: String(fields.get("allowedIps") ?? "")
                        .split(/\s+/)
                        .filter(Boolean),
                    scopes: [scope],
                },
            },
            {
                onSuccess: ({ token }) => {
                    close();
                    onToken(token);
                    issue.reset();
                },
            },
        );
    }

    return (
        <EditorSheet
            open
            onOpenChange={(open) => !open && close()}
            title="新建运维令牌"
            formId="ops-token-form"
            submitLabel="签发令牌"
            pending={issue.isPending}
            error={issue.error}
        >
            <form
                id="ops-token-form"
                onSubmit={submit}
                className="flex flex-col gap-group"
            >
                <div className="grid gap-field">
                    <Label htmlFor="ops-token-name">名称</Label>
                    <Input
                        id="ops-token-name"
                        name="name"
                        placeholder="opencode VPS"
                        maxLength={80}
                        required
                    />
                </div>
                <div className="grid gap-field">
                    <Label htmlFor="ops-token-expiration">
                        过期时间（北京时间）
                    </Label>
                    <Input
                        id="ops-token-expiration"
                        name="expiresAt"
                        type="datetime-local"
                        defaultValue={expiresAt}
                        max="9999-12-31T23:59"
                        required
                    />
                </div>
                <div className="grid gap-field">
                    <Label id="ops-token-scope">权限</Label>
                    <RadioGroup
                        aria-labelledby="ops-token-scope"
                        value={scope}
                        onValueChange={setScope}
                        className="flex flex-wrap gap-group"
                    >
                        {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                            <Label key={value} className="gap-field">
                                <RadioGroupItem value={value} /> {label}
                            </Label>
                        ))}
                    </RadioGroup>
                </div>
                <div className="grid gap-field">
                    <Label htmlFor="ops-token-ips">来源 IP（选填）</Label>
                    <Textarea
                        id="ops-token-ips"
                        name="allowedIps"
                        rows={2}
                        aria-describedby="ops-token-ips-help"
                    />
                    <p
                        id="ops-token-ips-help"
                        className="text-sm text-muted-foreground"
                    >
                        每行填写一个 IPv4 或 IPv6 地址。留空时允许任意来源。
                    </p>
                </div>
            </form>
        </EditorSheet>
    );
}

export function AdminOpsTokens() {
    const list = usePanel<OpsTokenInfo[]>(TOKEN_PATH);
    const revoke = useCommand();
    const [creating, setCreating] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<OpsTokenInfo | null>(null);
    const columns: ColumnDef<OpsTokenInfo>[] = [
        {
            accessorKey: "name",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="名称" />
            ),
            meta: { title: "名称" },
            enableHiding: false,
        },
        {
            id: "status",
            header: "状态",
            cell: ({ row }) => {
                const token = row.original;
                if (token.revokedAt)
                    return <Badge variant="secondary">已吊销</Badge>;
                if (Date.parse(token.expiresAt) <= Date.now())
                    return <Badge variant="warning">已过期</Badge>;
                return <Badge variant="success">有效</Badge>;
            },
            meta: { title: "状态" },
        },
        {
            id: "scope",
            header: "权限",
            accessorFn: (token) =>
                token.scopes.map((scope) => SCOPE_LABELS[scope]).join("、"),
            meta: { title: "权限" },
        },
        {
            id: "allowedIps",
            header: "来源 IP",
            accessorFn: (token) => token.allowedIps.join("、") || "任意来源",
            cell: ({ getValue }) => (
                <LongText className="max-w-56">{getValue<string>()}</LongText>
            ),
            meta: { title: "来源 IP" },
        },
        {
            accessorKey: "expiresAt",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="过期时间" />
            ),
            cell: ({ row }) => (
                <span className="numeric">
                    {formatDateTime(row.original.expiresAt)}
                </span>
            ),
            meta: { title: "过期时间" },
        },
        {
            id: "actions",
            cell: ({ row }) =>
                !row.original.revokedAt && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setRevoking(row.original)}
                    >
                        <ShieldOff /> 吊销
                    </Button>
                ),
            enableHiding: false,
        },
    ];

    return (
        <Page
            title="运维令牌"
            actions={
                <Button onClick={() => setCreating(true)}>
                    <Plus /> 新建令牌
                </Button>
            }
        >
            <DataTable
                columns={columns}
                data={list.data}
                isLoading={list.isPending}
                error={list.isError ? list.error : undefined}
                onRetry={() => list.refetch()}
                getRowId={(token) => token.id}
                searchPlaceholder="搜索令牌…"
            />
            {creating && (
                <TokenEditor
                    close={() => setCreating(false)}
                    onToken={setSecret}
                />
            )}
            <SecretDialog
                title="运维令牌"
                description="令牌明文仅显示一次。请存入 VPS 的环境变量或密钥管理器。"
                value={secret}
                onClose={() => setSecret(null)}
            />
            {revoking && (
                <ConfirmDialog
                    open
                    onOpenChange={(open) =>
                        !open && !revoke.isPending && setRevoking(null)
                    }
                    title="吊销运维令牌"
                    desc={`令牌“${revoking.name}”将立即失效。此操作无法撤销。`}
                    confirmText="吊销令牌"
                    destructive
                    isLoading={revoke.isPending}
                    handleConfirm={() =>
                        revoke.mutate(
                            {
                                path: `${TOKEN_PATH}/${revoking.id}`,
                                method: "DELETE",
                            },
                            {
                                onSuccess: () => setRevoking(null),
                            },
                        )
                    }
                />
            )}
        </Page>
    );
}
