import { Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useCommand, usePanel } from "../api/panel";
import { Checkbox, Feedback, Field, Form, TextArea } from "../components/forms";
import { Badge, Button, PageHeader } from "../components/primitives";
import { TicketList } from "../components/Tickets";
import { DataTable } from "./DataTable";
import { EditorPanel, WithEditor } from "./Editor";
import type { NoticeRow } from "./types";

function NoticeEditor({
    notice,
    onClose,
}: {
    notice: NoticeRow | null;
    onClose: () => void;
}) {
    const action = useCommand();
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
                        { onSuccess: onClose },
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
    const [editing, setEditing] = useState<NoticeRow | "new" | null>(null);

    return (
        <div className="space-y-6">
            <PageHeader
                title="公告"
                description="已发布的公告会展示给所有用户。"
                actions={
                    <Button onClick={() => setEditing("new")}>
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
                    empty={{ title: "还没有公告" }}
                    columns={[
                        {
                            key: "title",
                            header: "公告",
                            className: "max-w-md whitespace-normal",
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
