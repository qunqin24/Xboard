import { useRef, useState, type FormEvent } from "react";
import { FilePenLine, MailPlus } from "lucide-react";
import {
    broadcastBody,
    type BroadcastBody,
    type BroadcastResult,
    type MailTemplate,
    type MailTemplateKey,
} from "@xboard/contracts";
import { toast } from "sonner";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EditorSheet } from "./editor-sheet";

const TEMPLATE_LABELS: Record<MailTemplateKey, string> = {
    verify_email: "邮箱验证",
    reset_password: "密码重置",
    registration_code: "注册验证码",
    registration_taken: "邮箱已注册",
    expiry_reminder: "套餐到期",
    traffic_reminder: "流量用量",
};

export function BroadcastEditor({
    close,
    selectedIds,
}: {
    close: () => void;
    selectedIds?: number[];
}) {
    const send = useCommand<BroadcastResult>();
    const [preview, setPreview] = useState<BroadcastBody | null>(null);
    const previous = useRef<{ key: string; id: string } | null>(null);
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const payload = {
            subject: fields.get("subject"),
            text: fields.get("text"),
            ...(selectedIds
                ? {
                      scope: "selected" as const,
                      ids: [...new Set(selectedIds)].sort((a, b) => a - b),
                  }
                : { scope: "all" as const }),
        };
        const key = JSON.stringify(payload);
        if (previous.current?.key !== key)
            previous.current = { key, id: crypto.randomUUID() };
        const result = broadcastBody.safeParse({
            ...payload,
            requestId: previous.current.id,
        });
        if (!result.success) {
            toast.error(
                "邮件主题、正文或收件人有误；单次最多选择 200 位用户。",
            );
            return;
        }
        setPreview(result.data);
    }
    return (
        <>
            <EditorSheet
                open
                onOpenChange={(open) => !open && !send.isPending && close()}
                title="群发邮件"
                formId="mail-broadcast"
                submitLabel="检查并确认"
                pending={send.isPending}
            >
                <form
                    id="mail-broadcast"
                    className="flex flex-col gap-group"
                    onSubmit={submit}
                >
                    <p className="text-sm text-muted-foreground">
                        收件人：
                        {selectedIds
                            ? `已选 ${selectedIds.length} 位用户`
                            : "全部未封禁账户"}
                    </p>
                    <div className="grid gap-field">
                        <Label htmlFor="broadcast-subject">主题</Label>
                        <Input
                            id="broadcast-subject"
                            name="subject"
                            maxLength={160}
                            required
                        />
                    </div>
                    <div className="grid gap-field">
                        <Label htmlFor="broadcast-text">正文</Label>
                        <Textarea
                            id="broadcast-text"
                            name="text"
                            rows={10}
                            maxLength={20_000}
                            required
                        />
                    </div>
                </form>
            </EditorSheet>
            <ConfirmDialog
                open={preview !== null}
                onOpenChange={(open) =>
                    !open && !send.isPending && setPreview(null)
                }
                title="确认群发邮件"
                desc={
                    preview ? (
                        <div className="flex flex-col gap-field">
                            <p className="wrap-anywhere">
                                主题：{preview.subject}
                            </p>
                            <p>
                                收件人：
                                {preview.scope === "all"
                                    ? "全部未封禁账户"
                                    : `已选的 ${preview.ids.length} 位用户中的未封禁账户`}
                            </p>
                        </div>
                    ) : (
                        ""
                    )
                }
                confirmText="加入发送队列"
                isLoading={send.isPending}
                handleConfirm={() =>
                    preview &&
                    send.mutate(
                        { path: "/admin/mail/broadcast", body: preview },
                        {
                            onSuccess: (result) => {
                                setPreview(null);
                                close();
                                toast.success(
                                    `已将 ${result.recipients} 封邮件加入发送队列`,
                                );
                            },
                        },
                    )
                }
            />
        </>
    );
}

function TemplateEditor({ close }: { close: () => void }) {
    const list = usePanel<MailTemplate[]>("/admin/mail/templates");
    const save = useCommand();
    const [key, setKey] = useState<MailTemplateKey>("verify_email");
    const template = list.data?.find((item) => item.key === key);
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        save.mutate(
            {
                path: `/admin/mail/templates/${key}`,
                method: "PUT",
                body: {
                    subject: fields.get("subject"),
                    text: fields.get("text"),
                },
            },
            { onSuccess: () => toast.success("模板已保存") },
        );
    }
    return (
        <EditorSheet
            open
            onOpenChange={(open) => !open && close()}
            title="邮件模板"
            formId="mail-template"
            submitLabel="保存模板"
            pending={save.isPending}
            submitDisabled={!template}
        >
            {list.isPending ? (
                <Skeleton className="h-48" />
            ) : list.isError ? (
                <ErrorState
                    error={list.error}
                    onRetry={() => void list.refetch()}
                />
            ) : (
                <div className="grid gap-group">
                    <div className="grid gap-field">
                        <Label htmlFor="template-kind">模板</Label>
                        <Select
                            value={key}
                            onValueChange={(value) =>
                                setKey(value as MailTemplateKey)
                            }
                        >
                            <SelectTrigger id="template-kind">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {list.data.map((item) => (
                                    <SelectItem key={item.key} value={item.key}>
                                        {TEMPLATE_LABELS[item.key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {template && (
                        <form
                            id="mail-template"
                            key={template.key}
                            className="flex flex-col gap-group"
                            onSubmit={submit}
                        >
                            <div className="grid gap-field">
                                <Label htmlFor="template-subject">主题</Label>
                                <Input
                                    id="template-subject"
                                    name="subject"
                                    required
                                    maxLength={160}
                                    defaultValue={template.subject}
                                />
                            </div>
                            <div className="grid gap-field">
                                <Label htmlFor="template-text">正文</Label>
                                <Textarea
                                    id="template-text"
                                    name="text"
                                    rows={10}
                                    required
                                    maxLength={20_000}
                                    defaultValue={template.text}
                                />
                                <p className="text-xs text-muted-foreground">
                                    可用变量{" "}
                                    {template.variables
                                        .map((name) => `{{${name}}}`)
                                        .join("、")}
                                </p>
                                {!!template.required.length && (
                                    <p className="text-xs text-muted-foreground">
                                        正文必填变量{" "}
                                        {template.required
                                            .map((name) => `{{${name}}}`)
                                            .join("、")}
                                    </p>
                                )}
                            </div>
                        </form>
                    )}
                </div>
            )}
        </EditorSheet>
    );
}

export function MailTools() {
    const [open, setOpen] = useState<"broadcast" | "templates" | null>(null);
    return (
        <>
            <Button variant="outline" onClick={() => setOpen("templates")}>
                <FilePenLine /> 邮件模板
            </Button>
            <Button onClick={() => setOpen("broadcast")}>
                <MailPlus /> 群发邮件
            </Button>
            {open === "broadcast" && (
                <BroadcastEditor close={() => setOpen(null)} />
            )}
            {open === "templates" && (
                <TemplateEditor close={() => setOpen(null)} />
            )}
        </>
    );
}
