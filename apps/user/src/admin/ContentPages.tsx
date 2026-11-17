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
import { TicketList } from "../components/Tickets";
import { DataTable } from "./DataTable";
import {
    EditorPanel,
    useAdminAction,
    useEditorParam,
    WithEditor,
} from "./Editor";
import type { NoticeRow } from "./types";

function NoticeEditor({
    notice,
    onClose,
}: {
    notice: NoticeRow | null;
    onClose: () => void;
}) {
    const action = useCommand();
    const toast = useToast();
    return (
        <EditorPanel title={notice ? "编辑公告" : "新建公告"} onClose={onClose}>
            <Form
                key={notice?.id ?? "new"}
                busy={action.isPending}
                label={notice ? "保存修改" : "创建公告"}
                secondary={
                    <Button variant="quiet" onClick={onClose}>
                        取消
                    </Button>
                }
                submit={(form) =>
                    action.mutate(
                        {
                            path: notice
                                ? `/admin/notices/${notice.id}`
                                : "/admin/notices",
                            method: notice ? "PUT" : "POST",
                            body: {
                                title: form.get("title"),
                                content: form.get("content"),
                                published: form.has("published"),
                            },
                        },
                        {
                            onSuccess: () => {
                                toast.success(
                                    notice ? "公告已保存" : "公告已创建",
                                );
                                onClose();
                            },
                        },
                    )
                }
            >
                <Field
                    label="标题"
                    name="title"
                    defaultValue={notice?.title}
                    maxLength={120}
                    required
                />
                <TextArea
                    label="正文"
                    name="content"
                    rows={8}
                    defaultValue={notice?.content}
                />
                <Checkbox
                    name="published"
                    defaultChecked={notice?.published}
                    label="发布"
                    description="发布后显示在用户的账户与服务页。"
                />
            </Form>
            <Feedback error={action.error} />
        </EditorPanel>
    );
}

export function NoticesPage() {
    const list = usePanel<NoticeRow[]>("/admin/notices");
    const editor = useEditorParam("/admin/notices");
    const action = useAdminAction();
    const editing = editor.isNew
        ? "new"
        : (list.data?.find((notice) => notice.id === editor.editId) ?? null);

    return (
        <div className="space-y-6">
            <PageHeader
                title="公告"
                description="已发布的公告会展示在所有用户的账户与服务页顶部。"
                actions={
                    <Button onClick={() => editor.open("new")}>
                        <Plus aria-hidden className="size-4" />
                        新建公告
                    </Button>
                }
            />
            <WithEditor
                editor={
                    editing ? (
                        <NoticeEditor
                            notice={editing === "new" ? null : editing}
                            onClose={() => editor.open(null)}
                        />
                    ) : null
                }
            >
                <DataTable
                    id="notices"
                    query={list}
                    rowKey={(row) => row.id}
                    selectedKey={
                        editing && editing !== "new" ? editing.id : null
                    }
                    onRowClick={(notice) => editor.open(notice.id)}
                    empty={{ title: "还没有公告" }}
                    searchText={(n) => `${n.title} ${n.content}`}
                    searchPlaceholder="标题、正文"
                    facets={[
                        {
                            key: "status",
                            label: "状态",
                            value: (n) => (n.published ? "published" : "draft"),
                            labels: { published: "已发布", draft: "草稿" },
                        },
                    ]}
                    rowActions={(notice) => [
                        {
                            label: "编辑",
                            icon: PencilSimple,
                            onSelect: () => editor.open(notice.id),
                        },
                        {
                            label: notice.published ? "撤回" : "发布",
                            icon: notice.published ? EyeSlash : Eye,
                            onSelect: () =>
                                void action.run({
                                    path: `/admin/notices/${notice.id}`,
                                    method: "PUT",
                                    body: {
                                        title: notice.title,
                                        content: notice.content,
                                        published: !notice.published,
                                    },
                                    success: notice.published
                                        ? "公告已撤回"
                                        : "公告已发布",
                                }),
                        },
                        { separator: true },
                        {
                            label: "删除",
                            icon: Trash,
                            tone: "danger",
                            onSelect: async () => {
                                const done = await action.run({
                                    path: `/admin/notices/${notice.id}`,
                                    method: "DELETE",
                                    success: "公告已删除",
                                    confirm: {
                                        title: `删除公告“${notice.title}”？`,
                                        description:
                                            "删除后无法恢复。只想暂时隐藏可以改为撤回。",
                                        confirmLabel: "删除",
                                        tone: "danger",
                                    },
                                });
                                if (done && editor.editId === notice.id)
                                    editor.open(null);
                            },
                        },
                    ]}
                    columns={[
                        {
                            key: "title",
                            header: "公告",
                            hideable: false,
                            className: "max-w-md whitespace-normal",
                            sortValue: (n) => n.title,
                            cell: (n) => (
                                <>
                                    <p className="font-medium">{n.title}</p>
                                    <p className="line-clamp-1 text-xs text-ink-muted">
                                        {n.content}
                                    </p>
                                </>
                            ),
                        },
                        {
                            key: "status",
                            header: "状态",
                            align: "right",
                            sortValue: (n) => n.published,
                            cell: (n) =>
                                n.published ? (
                                    <Badge dot tone="success">
                                        已发布
                                    </Badge>
                                ) : (
                                    <Badge dot>草稿</Badge>
                                ),
                        },
                    ]}
                />
            </WithEditor>
        </div>
    );
}

export function TicketsPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="工单"
                description="回复用户的问题；关闭后用户仍可以重新打开。"
            />
            <div className="max-w-3xl">
                <TicketList staff />
            </div>
        </div>
    );
}
