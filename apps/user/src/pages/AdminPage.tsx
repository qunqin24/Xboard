import { useRef, useState } from "react";
import { useAccount } from "../api/hooks";
import { useCommand, usePanel } from "../api/panel";
import { AppShell } from "../components/AppShell";
import { Button, Card, Notice, SectionLabel } from "../components/primitives";
import {
    Feedback,
    Field,
    Form,
    inputClass,
    TextArea,
} from "../components/forms";
import { formatMinor, formatTraffic, periodLabel } from "../lib/format";
import { Tickets } from "./ManagePage";

type PlanRow = {
    id: number;
    name: string;
    content: string | null;
    transferEnable: string;
    speedLimit: number | null;
    deviceLimit: number | null;
    published: boolean;
    sort: number;
    prices: { period: string; amountMinor: number }[];
};
type NodeRow = {
    id: number;
    name: string;
    protocol: string;
    host: string;
    port: number;
    serverName: string;
    cipher: string;
    enabled: boolean;
    lastSeenAt: string | null;
    plans: { planId: number }[];
};
type UserRow = {
    id: number;
    email: string;
    role: string;
    balance: number;
    banned: boolean;
    transferEnable: string;
    upload: string;
    download: string;
    planId: number | null;
};
type NoticeRow = {
    id: number;
    title: string;
    content: string;
    published: boolean;
};

const number = (form: FormData, key: string) => Number(form.get(key));
const optionalNumber = (form: FormData, key: string) =>
    form.get(key) ? number(form, key) : null;

function PlanManager() {
    const list = usePanel<PlanRow[]>("/admin/plans");
    const action = useCommand();
    const [edit, setEdit] = useState<PlanRow | null>(null);

    return (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <Card>
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">
                        {edit ? `编辑套餐 #${edit.id}` : "创建套餐"}
                    </h2>
                    {edit ? (
                        <Button variant="quiet" onClick={() => setEdit(null)}>
                            取消编辑
                        </Button>
                    ) : null}
                </div>
                <Form
                    key={edit?.id ?? "new"}
                    busy={action.isPending}
                    submit={(form) => {
                        const prices = ["monthly", "quarterly", "yearly"]
                            .filter((period) => form.get(period) !== "")
                            .map((period) => ({
                                period,
                                amountMinor: number(form, period),
                            }));
                        action.mutate(
                            {
                                path: edit
                                    ? `/admin/plans/${edit.id}`
                                    : "/admin/plans",
                                method: edit ? "PUT" : "POST",
                                body: {
                                    name: form.get("name"),
                                    content: form.get("content"),
                                    transferBytes: form.get("transferBytes"),
                                    speedLimit: optionalNumber(
                                        form,
                                        "speedLimit",
                                    ),
                                    deviceLimit: optionalNumber(
                                        form,
                                        "deviceLimit",
                                    ),
                                    published: form.has("published"),
                                    sort: number(form, "sort"),
                                    prices,
                                },
                            },
                            { onSuccess: () => setEdit(null) },
                        );
                    }}
                >
                    <Field
                        label="套餐名称"
                        name="name"
                        defaultValue={edit?.name}
                        maxLength={80}
                        required
                    />
                    <TextArea
                        label="描述"
                        name="content"
                        defaultValue={edit?.content ?? ""}
                        required={false}
                    />
                    <Field
                        label="周期总流量（字节，1 GiB = 1073741824）"
                        name="transferBytes"
                        defaultValue={edit?.transferEnable ?? "107374182400"}
                        pattern="[1-9][0-9]{0,14}"
                        required
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label="限速 Mbps（空白为不限）"
                            name="speedLimit"
                            type="number"
                            min={1}
                            max={100000}
                            defaultValue={edit?.speedLimit ?? ""}
                        />
                        <Field
                            label="设备数（空白为不限）"
                            name="deviceLimit"
                            type="number"
                            min={1}
                            max={1000}
                            defaultValue={edit?.deviceLimit ?? ""}
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {["monthly", "quarterly", "yearly"].map((period) => (
                            <Field
                                key={period}
                                label={`${periodLabel(period)}（分）`}
                                name={period}
                                type="number"
                                min={0}
                                max={100000000}
                                step={1}
                                defaultValue={
                                    edit?.prices.find(
                                        (p) => p.period === period,
                                    )?.amountMinor ?? ""
                                }
                            />
                        ))}
                    </div>
                    <Field
                        label="排序"
                        name="sort"
                        type="number"
                        min={0}
                        defaultValue={edit?.sort ?? 0}
                        required
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                        <input
                            name="published"
                            type="checkbox"
                            defaultChecked={edit?.published}
                        />
                        发布销售
                    </label>
                </Form>
                <Feedback error={action.error} success={action.isSuccess} />
            </Card>

            <div className="space-y-3">
                {list.data?.map((plan) => (
                    <Card key={plan.id}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span
                                        aria-hidden
                                        className={`size-2 rounded-full ${
                                            plan.published
                                                ? "bg-signal"
                                                : "bg-ink-subtle"
                                        }`}
                                    />
                                    <h3 className="text-sm font-semibold text-ink">
                                        #{plan.id} {plan.name}
                                    </h3>
                                    <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                                        {plan.published ? "已发布" : "草稿"}
                                    </span>
                                </div>
                                <p className="numeric mt-2 text-xs text-ink-muted">
                                    {formatTraffic(plan.transferEnable)} ·{" "}
                                    {plan.prices
                                        .map(
                                            (p) =>
                                                `${periodLabel(p.period)} ${formatMinor(p.amountMinor)}`,
                                        )
                                        .join(" / ")}
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                onClick={() => setEdit(plan)}
                            >
                                编辑
                            </Button>
                        </div>
                    </Card>
                ))}
                <Feedback error={list.error} />
                {list.data?.length === 0 ? (
                    <Notice title="没有套餐">
                        创建第一个套餐后，再配置节点关联。
                    </Notice>
                ) : null}
            </div>
        </div>
    );
}

function UserActions({ user }: { user: UserRow }) {
    const action = useCommand();
    const request = useRef<{ signature: string; id: string } | null>(null);

    return (
        <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-line-subtle pb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span
                            aria-hidden
                            className={`size-2 rounded-full ${
                                user.banned ? "bg-warn" : "bg-signal"
                            }`}
                        />
                        <h3 className="text-sm font-semibold text-ink">
                            #{user.id} {user.email}
                        </h3>
                    </div>
                    <p className="numeric mt-1 text-xs text-ink-muted">
                        余额 {formatMinor(user.balance)} · 套餐{" "}
                        {user.planId ?? "无"}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-ink-muted">
                        {user.role}
                    </span>
                    <span
                        className={`rounded border px-2 py-0.5 ${
                            user.banned
                                ? "border-warn/35 bg-warn/10 text-warn"
                                : "border-line bg-surface-raised text-ink-muted"
                        }`}
                    >
                        {user.banned ? "已封禁" : "正常"}
                    </span>
                </div>
            </div>

            <Form
                busy={action.isPending}
                label="确认手动入账"
                submit={(form) => {
                    const body = {
                        amountMinor: number(form, "amountMinor"),
                        reason: String(form.get("reason")),
                    };
                    const signature = JSON.stringify(body);
                    if (request.current?.signature !== signature)
                        request.current = {
                            signature,
                            id: crypto.randomUUID(),
                        };
                    action.mutate(
                        {
                            path: `/admin/users/${user.id}/credit`,
                            body: { ...body, requestId: request.current.id },
                        },
                        {
                            onSuccess: () => {
                                request.current = null;
                            },
                        },
                    );
                }}
            >
                <Field
                    label="入账金额（整数分）"
                    type="number"
                    name="amountMinor"
                    min={1}
                    max={100000000}
                    step={1}
                    required
                />
                <Field
                    label="入账凭证或原因（写入审计）"
                    name="reason"
                    minLength={3}
                    maxLength={200}
                    required
                />
            </Form>

            <details className="mt-4 border-t border-line-subtle pt-3">
                <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink">
                    更多账户操作（封禁 / 流量重置）
                </summary>
                <div className="mt-3 space-y-4">
                    <Button
                        variant="secondary"
                        disabled={user.role === "admin" || action.isPending}
                        onClick={() =>
                            action.mutate({
                                path: `/admin/users/${user.id}/ban`,
                                body: { banned: !user.banned },
                            })
                        }
                    >
                        {user.banned ? "解除封禁" : "封禁并撤销登录"}
                    </Button>
                    <Form
                        busy={action.isPending}
                        label="确认清零已用流量"
                        submit={(form) =>
                            action.mutate({
                                path: `/admin/users/${user.id}/reset-traffic`,
                                body: Object.fromEntries(form),
                            })
                        }
                    >
                        <Field
                            label="流量重置原因"
                            name="reason"
                            minLength={3}
                            maxLength={200}
                            required
                        />
                    </Form>
                </div>
            </details>
            <Feedback error={action.error} success={action.isSuccess} />
        </Card>
    );
}

function UserManager() {
    const list = usePanel<UserRow[]>("/admin/users");
    const [search, setSearch] = useState("");

    return (
        <div className="space-y-4">
            <Card>
                <Field
                    label="筛选最近 200 个用户（邮箱或编号）"
                    placeholder="输入邮箱或用户 ID…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
                {list.data
                    ?.filter((user) =>
                        `${user.id} ${user.email}`.includes(search),
                    )
                    .map((user) => (
                        <UserActions key={user.id} user={user} />
                    ))}
            </div>
            <Feedback error={list.error} />
        </div>
    );
}

function NodeManager() {
    const list = usePanel<NodeRow[]>("/admin/nodes");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const action = useCommand();
    const [edit, setEdit] = useState<NodeRow | null>(null);
    const [token, setToken] = useState<{ id: number; token: string } | null>(
        null,
    );

    return (
        <div className="space-y-6">
            <Notice title="UniProxy 节点接入">
                API 地址为本站域名，节点编号与密钥在创建后显示。支持 TCP + TLS
                的 VMess / VLESS / Trojan，传统 AEAD Shadowsocks，以及 Hysteria2
                / TUIC。TLS 证书由节点后端配置。
            </Notice>
            {token ? (
                <Card className="border-signal/40">
                    <h3 className="mb-3 text-sm font-semibold text-signal">
                        节点 #{token.id} 密钥（仅显示一次）
                    </h3>
                    <Field
                        label="ApiKey / Key"
                        value={token.token}
                        readOnly
                        onFocus={(event) => event.target.select()}
                    />
                    <p className="numeric mt-2 text-xs text-ink-muted">
                        配置接口：/api/v1/server/UniProxy/config?node_id=
                        {token.id}&amp;node_type=协议&amp;token=密钥
                    </p>
                </Card>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <Card>
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-ink">
                            {edit ? `编辑节点 #${edit.id}` : "创建节点"}
                        </h2>
                        {edit ? (
                            <Button
                                variant="quiet"
                                onClick={() => setEdit(null)}
                            >
                                取消编辑
                            </Button>
                        ) : null}
                    </div>
                    <Form
                        key={edit?.id ?? "new"}
                        busy={action.isPending}
                        submit={(form) =>
                            action.mutate(
                                {
                                    path: edit
                                        ? `/admin/nodes/${edit.id}`
                                        : "/admin/nodes",
                                    method: edit ? "PUT" : "POST",
                                    body: {
                                        name: form.get("name"),
                                        protocol: form.get("protocol"),
                                        host: form.get("host"),
                                        port: number(form, "port"),
                                        serverName: form.get("serverName"),
                                        cipher: form.get("cipher"),
                                        enabled: form.has("enabled"),
                                        planIds: form
                                            .getAll("planIds")
                                            .map(Number),
                                    },
                                },
                                {
                                    onSuccess: (result) => {
                                        if (typeof result.token === "string")
                                            setToken({
                                                id: Number(result.id),
                                                token: result.token,
                                            });
                                        setEdit(null);
                                    },
                                },
                            )
                        }
                    >
                        <Field
                            label="名称"
                            name="name"
                            defaultValue={edit?.name}
                            required
                            maxLength={80}
                        />
                        <label className="block text-sm">
                            <span>协议</span>
                            <select
                                className={`${inputClass} mt-2`}
                                name="protocol"
                                defaultValue={edit?.protocol ?? "vless"}
                            >
                                {[
                                    "vmess",
                                    "vless",
                                    "trojan",
                                    "shadowsocks",
                                    "hysteria2",
                                    "tuic",
                                ].map((type) => (
                                    <option key={type}>{type}</option>
                                ))}
                            </select>
                        </label>
                        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                            <Field
                                label="服务器域名或 IP"
                                name="host"
                                defaultValue={edit?.host}
                                required
                            />
                            <Field
                                label="端口"
                                name="port"
                                type="number"
                                min={1}
                                max={65535}
                                defaultValue={edit?.port ?? 443}
                                required
                            />
                        </div>
                        <Field
                            label="TLS Server Name（建议使用证书域名）"
                            name="serverName"
                            defaultValue={edit?.serverName}
                        />
                        <label className="block text-sm">
                            <span>Shadowsocks 加密</span>
                            <select
                                className={`${inputClass} mt-2`}
                                name="cipher"
                                defaultValue={edit?.cipher ?? "aes-128-gcm"}
                            >
                                {[
                                    "aes-128-gcm",
                                    "aes-256-gcm",
                                    "chacha20-ietf-poly1305",
                                ].map((cipher) => (
                                    <option key={cipher}>{cipher}</option>
                                ))}
                            </select>
                        </label>
                        <fieldset className="space-y-2 rounded-lg border border-line bg-surface-raised p-3 text-xs">
                            <legend className="px-1 font-medium text-ink-muted">
                                允许使用的套餐
                            </legend>
                            {plans.data?.map((plan) => (
                                <label
                                    className="flex cursor-pointer items-center gap-2 text-ink"
                                    key={plan.id}
                                >
                                    <input
                                        type="checkbox"
                                        name="planIds"
                                        value={plan.id}
                                        defaultChecked={edit?.plans.some(
                                            (p) => p.planId === plan.id,
                                        )}
                                    />
                                    #{plan.id} {plan.name}
                                </label>
                            ))}
                        </fieldset>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                            <input
                                type="checkbox"
                                name="enabled"
                                defaultChecked={edit?.enabled}
                            />
                            启用节点
                        </label>
                    </Form>
                    <Feedback error={action.error} success={action.isSuccess} />
                </Card>

                <div className="space-y-3">
                    {list.data?.map((node) => (
                        <Card key={node.id}>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            aria-hidden
                                            className={`size-2 rounded-full ${
                                                node.enabled
                                                    ? "bg-signal"
                                                    : "bg-ink-subtle"
                                            }`}
                                        />
                                        <h3 className="text-sm font-semibold text-ink">
                                            #{node.id} {node.name}
                                        </h3>
                                        <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                                            {node.enabled ? "启用" : "停用"}
                                        </span>
                                    </div>
                                    <p className="numeric mt-2 text-xs text-ink">
                                        {node.protocol} · {node.host}:
                                        {node.port}
                                    </p>
                                    <p className="numeric mt-1 text-xs text-ink-muted">
                                        最近上报：
                                        {node.lastSeenAt
                                            ? new Date(
                                                  node.lastSeenAt,
                                              ).toLocaleString("zh-CN")
                                            : "尚未连接"}
                                    </p>
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={() => setEdit(node)}
                                >
                                    编辑
                                </Button>
                            </div>
                            <details className="mt-4 border-t border-line-subtle pt-3">
                                <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">
                                    重置节点密钥
                                </summary>
                                <p className="my-2 text-xs text-ink-muted">
                                    原密钥将失效，需要同步修改节点配置。
                                </p>
                                <Button
                                    variant="secondary"
                                    disabled={action.isPending}
                                    onClick={() =>
                                        action.mutate(
                                            {
                                                path: `/admin/nodes/${node.id}/token`,
                                            },
                                            {
                                                onSuccess: (result) =>
                                                    setToken({
                                                        id: node.id,
                                                        token: String(
                                                            result.token,
                                                        ),
                                                    }),
                                            },
                                        )
                                    }
                                >
                                    确认重置
                                </Button>
                            </details>
                        </Card>
                    ))}
                    <Feedback error={list.error} />
                </div>
            </div>
        </div>
    );
}

function NoticesManager() {
    const list = usePanel<NoticeRow[]>("/admin/notices");
    const action = useCommand();
    const [edit, setEdit] = useState<NoticeRow | null>(null);

    return (
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <Card>
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">
                        {edit ? "编辑公告" : "发布新公告"}
                    </h2>
                    {edit ? (
                        <Button variant="quiet" onClick={() => setEdit(null)}>
                            取消编辑
                        </Button>
                    ) : null}
                </div>
                <Form
                    key={edit?.id ?? "new"}
                    busy={action.isPending}
                    submit={(form) =>
                        action.mutate(
                            {
                                path: edit
                                    ? `/admin/notices/${edit.id}`
                                    : "/admin/notices",
                                method: edit ? "PUT" : "POST",
                                body: {
                                    title: form.get("title"),
                                    content: form.get("content"),
                                    published: form.has("published"),
                                },
                            },
                            { onSuccess: () => setEdit(null) },
                        )
                    }
                >
                    <Field
                        label="标题"
                        name="title"
                        defaultValue={edit?.title}
                        maxLength={120}
                        required
                    />
                    <TextArea
                        label="正文"
                        name="content"
                        defaultValue={edit?.content}
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                        <input
                            type="checkbox"
                            name="published"
                            defaultChecked={edit?.published}
                        />
                        立即发布
                    </label>
                </Form>
                <Feedback error={action.error} success={action.isSuccess} />
            </Card>

            <div className="space-y-3">
                {list.data?.map((notice) => (
                    <Card key={notice.id}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span
                                    aria-hidden
                                    className={`size-2 rounded-full ${
                                        notice.published
                                            ? "bg-signal"
                                            : "bg-ink-subtle"
                                    }`}
                                />
                                <h3 className="text-sm font-semibold text-ink">
                                    {notice.title}
                                </h3>
                                <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                                    {notice.published ? "已发布" : "草稿"}
                                </span>
                            </div>
                            <Button
                                variant="secondary"
                                onClick={() => setEdit(notice)}
                            >
                                编辑
                            </Button>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
                            {notice.content}
                        </p>
                    </Card>
                ))}
                <Feedback error={list.error} />
            </div>
        </div>
    );
}

function Records({ kind }: { kind: "orders" | "ledger" | "audit" | "mail" }) {
    const list = usePanel<Record<string, unknown>[]>(`/admin/${kind}`);
    const fields =
        kind === "orders"
            ? ["id", "userId", "planName", "status", "amountMinor", "createdAt"]
            : kind === "ledger"
              ? [
                    "id",
                    "userId",
                    "amountMinor",
                    "reason",
                    "actorId",
                    "createdAt",
                ]
              : kind === "mail"
                ? ["id", "to", "subject", "attempts", "sentAt", "nextAttempt"]
                : ["id", "actorId", "action", "target", "detail", "createdAt"];
    const labels: Record<string, string> = {
        id: "编号",
        userId: "用户",
        planName: "套餐",
        status: "状态",
        amountMinor: "金额（分）",
        reason: "原因",
        actorId: "操作人",
        action: "操作",
        target: "对象",
        detail: "详情",
        createdAt: "时间",
        to: "收件人",
        subject: "主题",
        attempts: "尝试次数",
        sentAt: "发送时间",
        nextAttempt: "下次尝试",
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>最近 200 条记录</span>
                <span>{list.data ? `共 ${list.data.length} 条` : ""}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="border-b border-line bg-surface-raised text-ink-muted">
                                {fields.map((field) => (
                                    <th
                                        key={field}
                                        className="px-4 py-3 font-medium"
                                    >
                                        {labels[field]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-subtle">
                            {list.data?.map((row, index) => (
                                <tr
                                    key={String(row.id ?? index)}
                                    className="transition-colors hover:bg-surface-raised/60"
                                >
                                    {fields.map((field) => (
                                        <td
                                            key={field}
                                            className="numeric max-w-sm break-words px-4 py-3 text-ink"
                                        >
                                            {typeof row[field] === "object"
                                                ? JSON.stringify(row[field])
                                                : String(row[field] ?? "—")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {list.data?.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-ink-muted">
                        暂无记录。
                    </p>
                ) : null}
            </div>
            <Feedback error={list.error} />
        </div>
    );
}

function Overview() {
    const stats = usePanel<{
        users: number;
        orders: number;
        nodes: number;
        openTickets: number;
        revenueMinor: number;
    }>("/admin/overview");

    return (
        <div className="space-y-4">
            {stats.data ? (
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                        ["用户总数", stats.data.users],
                        ["订单总数", stats.data.orders],
                        ["节点数量", stats.data.nodes],
                        ["待处理工单", stats.data.openTickets],
                        [
                            "已支付订单总额",
                            formatMinor(stats.data.revenueMinor),
                        ],
                    ].map(([label, value]) => (
                        <Card key={label}>
                            <dt className="text-xs font-medium text-ink-muted">
                                {label}
                            </dt>
                            <dd className="numeric mt-2 text-2xl font-semibold tracking-tight text-ink">
                                {value}
                            </dd>
                        </Card>
                    ))}
                </dl>
            ) : (
                <Card>
                    <SectionLabel>运营概览</SectionLabel>
                    <p className="mt-2 text-xs text-ink-muted">正在加载…</p>
                </Card>
            )}
            <Feedback error={stats.error} />
        </div>
    );
}

export function AdminPage() {
    const account = useAccount();
    const [tab, setTab] = useState("overview");

    if (account.data?.role !== "admin") {
        return (
            <AppShell>
                <Notice title="需要管理员权限">请使用管理员账户登录。</Notice>
            </AppShell>
        );
    }

    const tabs = {
        overview: "概览",
        plans: "套餐",
        users: "用户与入账",
        nodes: "节点",
        orders: "订单",
        ledger: "余额流水",
        notices: "公告",
        tickets: "工单",
        audit: "审计",
        mail: "邮件队列",
    };

    return (
        <AppShell email={account.data.email}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">
                        Admin Console
                    </h1>
                    <p className="mt-1 text-xs text-ink-muted">
                        运营概览、套餐与节点配置、用户入账、工单处理与系统审计
                    </p>
                </div>

                <nav
                    aria-label="后台功能"
                    className="flex gap-5 overflow-x-auto border-b border-line text-xs"
                >
                    {Object.entries(tabs).map(([key, label]) => {
                        const active = tab === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setTab(key)}
                                className={`shrink-0 cursor-pointer border-b-2 pb-3 pt-1 font-medium transition-colors ${
                                    active
                                        ? "border-ink text-ink"
                                        : "border-transparent text-ink-muted hover:text-ink"
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </nav>

                {tab === "overview" ? (
                    <Overview />
                ) : tab === "plans" ? (
                    <PlanManager />
                ) : tab === "users" ? (
                    <UserManager />
                ) : tab === "nodes" ? (
                    <NodeManager />
                ) : tab === "notices" ? (
                    <NoticesManager />
                ) : tab === "tickets" ? (
                    <Tickets staff />
                ) : (
                    <Records
                        key={tab}
                        kind={tab as "orders" | "ledger" | "audit" | "mail"}
                    />
                )}
            </div>
        </AppShell>
    );
}
