import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import {
    operationalGroups,
    exportedKeySchema,
    type BackupRun,
    type OperationalGroup,
} from "@xboard/contracts";
import { useAccount } from "@/api/hooks";
import { useCommand, usePanel } from "@/api/panel";
import { ErrorState } from "@/components/error-state";
import { LoadingButton } from "@/components/loading-button";
import { SecretDialog } from "@/components/secret-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadAnnouncement } from "@/components/load-announcement";
import { currentLocale } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { serverErrorMessage } from "@/lib/handle-server-error";
import { EditorSheet } from "./editor-sheet";

type Field = {
    name: string;
    label: string;
    kind?: "password" | "number" | "time" | "checkbox";
    choices?: Record<string, string>;
    provider?: "r2" | "s3";
};
const fields: Record<OperationalGroup, Field[]> = {
    captcha: [
        {
            name: "captchaProvider",
            label: "验证服务",
            choices: {
                off: "关闭",
                turnstile: "Cloudflare Turnstile",
                recaptcha: "reCAPTCHA v2",
                hcaptcha: "hCaptcha",
            },
        },
        { name: "captchaSiteKey", label: "站点公钥" },
        { name: "captchaSecretKey", label: "验证密钥", kind: "password" },
        {
            name: "captchaOnRegister",
            label: "注册和领取验证码时验证",
            kind: "checkbox",
        },
        { name: "captchaOnLogin", label: "登录时验证", kind: "checkbox" },
        {
            name: "captchaOnPasswordReset",
            label: "申请找回密码时验证",
            kind: "checkbox",
        },
    ],
    mail: [
        { name: "smtpHost", label: "SMTP 服务器" },
        { name: "smtpPort", label: "端口", kind: "number" },
        { name: "smtpSecure", label: "使用隐式 TLS", kind: "checkbox" },
        { name: "smtpUser", label: "用户名" },
        { name: "smtpPassword", label: "SMTP 密码", kind: "password" },
        { name: "mailFrom", label: "发件人" },
    ],
    alerts: [
        {
            name: "alertWebhookUrl",
            label: "HTTPS 告警 Webhook",
            kind: "password",
        },
    ],
    backup: [
        { name: "backupEnabled", label: "每日自动备份", kind: "checkbox" },
        { name: "backupTime", label: "备份时间（北京时间）", kind: "time" },
        {
            name: "backupStorage",
            label: "存储类型",
            choices: { r2: "Cloudflare R2", s3: "其他 S3 兼容存储" },
        },
        {
            name: "backupR2AccountId",
            label: "Cloudflare 账户 ID",
            provider: "r2",
        },
        {
            name: "backupR2Jurisdiction",
            label: "R2 管辖区",
            provider: "r2",
            choices: { default: "默认", eu: "欧盟" },
        },
        { name: "backupS3Endpoint", label: "S3 地址", provider: "s3" },
        { name: "backupS3Region", label: "S3 区域", provider: "s3" },
        {
            name: "backupS3ForcePathStyle",
            label: "使用路径风格",
            kind: "checkbox",
            provider: "s3",
        },
        { name: "backupBucket", label: "存储桶名称" },
        { name: "backupPrefix", label: "对象前缀" },
        { name: "backupAccessKeyId", label: "Access Key ID" },
        {
            name: "backupSecretAccessKey",
            label: "Secret Access Key",
            kind: "password",
        },
        { name: "backupAgeRecipient", label: "age 公钥" },
    ],
};
const titles = {
    mail: "邮件服务",
    alerts: "告警",
    backup: "备份",
    captcha: "人机验证",
};
const pathFor = (group: OperationalGroup) => `/admin/settings/${group}`;

type GroupValues = z.output<
    (typeof operationalGroups)[OperationalGroup]["output"]
>;

function GroupForm({
    group,
    values,
}: {
    group: OperationalGroup;
    values: GroupValues;
}) {
    const valuesByName = values as Record<string, unknown>;
    const [provider, setProvider] = useState(
        String(valuesByName.backupStorage ?? "r2"),
    );
    const [version, setVersion] = useState(0);
    const save = useCommand({ inline: true });
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const input = new FormData(event.currentTarget);
        const body = Object.fromEntries(
            fields[group].flatMap(({ name, kind }): [string, unknown][] => {
                const value = input.get(name);
                if (kind === "password") {
                    if (input.has(`${name}-clear`)) return [[name, null]];
                    return value ? [[name, value]] : [];
                }
                if (kind === "checkbox") return [[name, input.has(name)]];
                return [[name, kind === "number" ? Number(value) : value]];
            }),
        );
        save.mutate(
            { path: pathFor(group), method: "PUT", body },
            {
                onSuccess: () => {
                    toast.success(`${titles[group]}设置已保存`);
                    setVersion((value) => value + 1);
                },
            },
        );
    }
    return (
        <form
            key={version}
            onSubmit={submit}
            className="flex flex-col gap-group"
        >
            <div className="grid gap-group sm:grid-cols-2">
                {fields[group].map(
                    ({ name, label, kind, choices, provider: only }) => {
                        const id = `operational-${name}`;
                        const value = valuesByName[name];
                        return (
                            <div
                                key={name}
                                className={
                                    only && only !== provider
                                        ? "hidden"
                                        : "grid content-start gap-field"
                                }
                            >
                                {kind === "checkbox" ? (
                                    <Label htmlFor={id}>
                                        <Input
                                            id={id}
                                            name={name}
                                            type="checkbox"
                                            className="size-4"
                                            defaultChecked={value === true}
                                        />
                                        {label}
                                    </Label>
                                ) : (
                                    <>
                                        <Label htmlFor={id}>{label}</Label>
                                        {choices ? (
                                            <select
                                                id={id}
                                                name={name}
                                                className="h-9 rounded-control border bg-background px-field"
                                                defaultValue={String(
                                                    value ?? "",
                                                )}
                                                onChange={
                                                    name === "backupStorage"
                                                        ? (event) =>
                                                              setProvider(
                                                                  event.target
                                                                      .value,
                                                              )
                                                        : undefined
                                                }
                                            >
                                                {Object.entries(choices).map(
                                                    ([key, label]) => (
                                                        <option
                                                            key={key}
                                                            value={key}
                                                        >
                                                            {label}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        ) : (
                                            <Input
                                                id={id}
                                                name={name}
                                                type={kind ?? "text"}
                                                autoComplete={
                                                    kind === "password"
                                                        ? "new-password"
                                                        : undefined
                                                }
                                                defaultValue={
                                                    kind === "password"
                                                        ? ""
                                                        : String(value ?? "")
                                                }
                                                placeholder={
                                                    kind === "password" &&
                                                    valuesByName[`${name}Set`]
                                                        ? "已设置"
                                                        : undefined
                                                }
                                            />
                                        )}
                                        {kind === "password" &&
                                        valuesByName[`${name}Set`] ? (
                                            <Label htmlFor={`${id}-clear`}>
                                                <Input
                                                    id={`${id}-clear`}
                                                    name={`${name}-clear`}
                                                    type="checkbox"
                                                    className="size-4"
                                                />
                                                清空此项
                                            </Label>
                                        ) : null}
                                    </>
                                )}
                            </div>
                        );
                    },
                )}
            </div>
            {save.error ? (
                <Alert variant="destructive">
                    <AlertDescription>
                        {serverErrorMessage(save.error)}
                    </AlertDescription>
                </Alert>
            ) : null}
            <LoadingButton
                type="submit"
                loading={save.isPending}
                className="self-start"
            >
                保存{titles[group]}设置
            </LoadingButton>
        </form>
    );
}

function MailTest() {
    const send = useCommand();
    return (
        <form
            className="flex flex-wrap items-end gap-inline"
            onSubmit={(event) => {
                event.preventDefault();
                const body = Object.fromEntries(
                    new FormData(event.currentTarget),
                );
                send.mutate(
                    {
                        path: `${pathFor("mail")}/test`,
                        body,
                        related: ["/admin/mail"],
                    },
                    { onSuccess: () => toast.success("测试邮件已加入队列") },
                );
            }}
        >
            <div className="grid gap-field">
                <Label htmlFor="mail-test-to">测试收件人</Label>
                <Input id="mail-test-to" name="to" type="email" required />
            </div>
            <LoadingButton
                variant="outline"
                type="submit"
                loading={send.isPending}
            >
                发送测试邮件
            </LoadingButton>
        </form>
    );
}

function BackupActions() {
    const history = usePanel<BackupRun[]>(`${pathFor("backup")}/runs`, {
        refetchInterval: (rows) =>
            rows?.some((row) => row.status === "pending") ? 5_000 : 30_000,
    });
    const test = useCommand();
    const queue = useCommand();
    return (
        <div className="grid gap-group">
            <div className="flex flex-wrap gap-inline">
                <LoadingButton
                    variant="outline"
                    loading={test.isPending}
                    onClick={() =>
                        test.mutate(
                            { path: `${pathFor("backup")}/test` },
                            {
                                onSuccess: () =>
                                    toast.success("存储连接测试通过"),
                            },
                        )
                    }
                >
                    测试连接
                </LoadingButton>
                <LoadingButton
                    variant="outline"
                    loading={queue.isPending}
                    onClick={() =>
                        queue.mutate(
                            { path: `${pathFor("backup")}/runs` },
                            {
                                onSuccess: () =>
                                    toast.success("备份已加入队列"),
                            },
                        )
                    }
                >
                    立即备份
                </LoadingButton>
            </div>
            {history.isError ? (
                <ErrorState
                    error={history.error}
                    onRetry={() => history.refetch()}
                />
            ) : history.isPending ? (
                <Skeleton className="h-9" />
            ) : history.data?.length ? (
                <ul className="grid gap-field" aria-label="最近备份">
                    {history.data.map((row) => (
                        <li
                            key={row.id}
                            className="flex flex-wrap items-center gap-inline text-sm"
                        >
                            <span className="numeric">
                                {formatDateTime(row.createdAt)}
                            </span>
                            <Badge
                                variant={
                                    row.status === "completed"
                                        ? "success"
                                        : row.status === "failed"
                                          ? "destructive"
                                          : "secondary"
                                }
                            >
                                {
                                    {
                                        pending: "待处理",
                                        completed: "已完成",
                                        failed: "失败",
                                    }[row.status]
                                }
                            </Badge>
                            {row.bytes ? (
                                <span>
                                    {(Number(row.bytes) / 1024).toLocaleString(
                                        currentLocale(),
                                        { maximumFractionDigits: 1 },
                                    )}{" "}
                                    KiB
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-muted-foreground">暂无备份记录</p>
            )}
        </div>
    );
}

function ApplicationKey() {
    const account = useAccount();
    const [open, setOpen] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const action = useCommand<z.output<typeof exportedKeySchema>>({
        inline: true,
    });
    return (
        <Card className="max-w-3xl">
            <CardHeader>
                <CardTitle>应用密钥</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-group">
                <p className="text-sm text-muted-foreground">
                    应用密钥用于解密两步验证和后台保存的敏感配置。请妥善保存导出的副本。
                </p>
                <Button
                    variant="outline"
                    onClick={() => {
                        action.reset();
                        setOpen(true);
                    }}
                >
                    导出应用密钥
                </Button>
                <EditorSheet
                    open={open}
                    onOpenChange={setOpen}
                    title="导出应用密钥"
                    formId="export-application-key"
                    submitLabel="验证并导出"
                    pending={action.isPending}
                    error={action.error}
                >
                    {open ? (
                        <form
                            id="export-application-key"
                            className="grid gap-group"
                            onSubmit={(event) => {
                                event.preventDefault();
                                const body = Object.fromEntries(
                                    new FormData(event.currentTarget),
                                );
                                action.mutate(
                                    {
                                        path: "/admin/settings/application-key",
                                        body,
                                    },
                                    {
                                        onSuccess: (result) => {
                                            setOpen(false);
                                            setSecret(result.appKey);
                                            action.reset();
                                        },
                                    },
                                );
                            }}
                        >
                            <div className="grid gap-field">
                                <Label htmlFor="export-key-password">
                                    管理员密码
                                </Label>
                                <Input
                                    id="export-key-password"
                                    name="password"
                                    autoComplete="current-password"
                                    type="password"
                                    required
                                />
                            </div>
                            {account.data?.twoFactorEnabled ? (
                                <div className="grid gap-field">
                                    <Label htmlFor="export-key-factor">
                                        动态验证码或恢复码
                                    </Label>
                                    <Input
                                        id="export-key-factor"
                                        name="twoFactorCode"
                                        autoComplete="one-time-code"
                                        required
                                    />
                                </div>
                            ) : null}
                        </form>
                    ) : null}
                </EditorSheet>
                <SecretDialog
                    title="应用密钥"
                    description="请保存在独立的密钥管理器或加密存储中。"
                    value={secret}
                    onClose={() => setSecret(null)}
                />
            </CardContent>
        </Card>
    );
}

function GroupCard({ group }: { group: OperationalGroup }) {
    const values = usePanel<GroupValues>(pathFor(group));
    const alert = useCommand();
    return (
        <Card className="max-w-3xl">
            <CardHeader>
                <CardTitle>{titles[group]}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-group">
                <LoadAnnouncement
                    loading={values.isPending}
                    failed={values.isError}
                />
                {values.isError ? (
                    <ErrorState
                        error={values.error}
                        onRetry={() => values.refetch()}
                    />
                ) : values.data ? (
                    <GroupForm
                        key={JSON.stringify(values.data)}
                        group={group}
                        values={values.data}
                    />
                ) : (
                    <Skeleton className="h-20" />
                )}
                {group === "mail" ? (
                    <MailTest />
                ) : group === "backup" ? (
                    <BackupActions />
                ) : group === "alerts" ? (
                    <LoadingButton
                        variant="outline"
                        loading={alert.isPending}
                        className="self-start"
                        onClick={() =>
                            alert.mutate(
                                { path: `${pathFor("alerts")}/test` },
                                {
                                    onSuccess: () =>
                                        toast.success("测试告警已发送"),
                                },
                            )
                        }
                    >
                        发送测试告警
                    </LoadingButton>
                ) : null}
            </CardContent>
        </Card>
    );
}

export function OperationalSettings() {
    return (
        <>
            {(["mail", "alerts", "backup", "captcha"] as const).map((group) => (
                <GroupCard key={group} group={group} />
            ))}
            <ApplicationKey />
        </>
    );
}
