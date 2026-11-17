import { zodResolver } from "@hookform/resolvers/zod";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand, usePanel } from "@/api/panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
    RowActions,
} from "@/components/data-table";
import { Page } from "@/components/layout/page";
import { LongText } from "@/components/long-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEditorSearch } from "./editor-search";
import { EditorSheet } from "./editor-sheet";
import type { NoticeRow } from "./types";

const schema = z.object({
    title: z.string().trim().min(1, "请输入标题").max(120, "标题最多 120 个字"),
    content: z.string().trim().min(1, "请输入正文").max(10000, "正文过长"),
    published: z.boolean(),
});

function NoticeSheet({
    notice,
    open,
    onClose,
}: {
    notice: NoticeRow | null;
    open: boolean;
    onClose: () => void;
}) {
    const save = useCommand();
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        values: {
            title: notice?.title ?? "",
            content: notice?.content ?? "",
            published: notice?.published ?? false,
        },
    });
    return (
        <EditorSheet
            open={open}
            onOpenChange={(value) => !value && onClose()}
            title={notice ? "编辑公告" : "新建公告"}
            description="已发布的公告会显示在所有用户的总览页。"
            formId="notice-form"
            submitLabel={notice ? "保存修改" : "创建公告"}
            pending={save.isPending}
        >
            <Form {...form}>
                <form
                    id="notice-form"
                    className="space-y-5"
                    onSubmit={form.handleSubmit((body) =>
                        save.mutate(
                            {
                                path: notice
                                    ? `/admin/notices/${notice.id}`
                                    : "/admin/notices",
                                method: notice ? "PUT" : "POST",
                                body,
                            },
                            {
                                onSuccess: () => {
                                    toast.success(
                                        notice ? "公告已保存" : "公告已创建",
                                    );
                                    onClose();
                                },
                            },
                        ),
                    )}
                >
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>标题</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="content"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>正文</FormLabel>
                                <FormControl>
                                    <Textarea rows={10} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="published"
                        render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <FormLabel>发布</FormLabel>
                                    <FormDescription>
                                        关闭则保存为草稿。
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </form>
            </Form>
        </EditorSheet>
    );
}

export function AdminNotices() {
    const list = usePanel<NoticeRow[]>("/admin/notices");
    const editor = useEditorSearch("/admin/notices");
    const action = useCommand();
    const [deleting, setDeleting] = useState<NoticeRow | null>(null);
    const editing = list.data?.find((n) => n.id === editor.editId) ?? null;

    const columns: ColumnDef<NoticeRow>[] = [
        {
            accessorKey: "title",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="公告" />
            ),
            cell: ({ row }) => (
                <div className="max-w-xl">
                    <p className="font-medium">{row.original.title}</p>
                    <LongText className="text-xs text-muted-foreground">
                        {row.original.content}
                    </LongText>
                </div>
            ),
            enableHiding: false,
            meta: { title: "标题" },
        },
        {
            id: "status",
            accessorFn: (n) => (n.published ? "已发布" : "草稿"),
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="状态" />
            ),
            cell: ({ getValue }) => (
                <Badge
                    variant={getValue() === "已发布" ? "default" : "secondary"}
                >
                    {getValue<string>()}
                </Badge>
            ),
            filterFn: inFilter,
            meta: { title: "状态" },
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
                            label: row.original.published ? "撤回" : "发布",
                            icon: row.original.published ? EyeOff : Eye,
                            onSelect: () =>
                                action.mutate(
                                    {
                                        path: `/admin/notices/${row.original.id}`,
                                        method: "PUT",
                                        body: {
                                            title: row.original.title,
                                            content: row.original.content,
                                            published: !row.original.published,
                                        },
                                    },
                                    {
                                        onSuccess: () =>
                                            toast.success(
                                                row.original.published
                                                    ? "已撤回"
                                                    : "已发布",
                                            ),
                                    },
                                ),
                        },
                        "separator",
                        {
                            label: "删除",
                            icon: Trash2,
                            destructive: true,
                            onSelect: () => setDeleting(row.original),
                        },
                    ]}
                />
            ),
            meta: { className: "w-12" },
        },
    ];

    return (
        <Page
            title="公告"
            description="已发布的公告会显示在所有用户的总览页。"
            actions={
                <Button onClick={() => editor.open("new")}>
                    <Plus /> 新建公告
                </Button>
            }
        >
            <DataTable
                data={list.data}
                isLoading={list.isPending}
                columns={columns}
                getRowId={(n) => String(n.id)}
                searchPlaceholder="标题、正文…"
                onRowClick={(n) => editor.open(n.id)}
                selectedRowId={editor.editId ? String(editor.editId) : null}
                emptyText="还没有公告。"
                filters={[
                    {
                        columnId: "status",
                        title: "状态",
                        options: ["已发布", "草稿"].map((v) => ({
                            value: v,
                            label: v,
                        })),
                    },
                ]}
            />
            <NoticeSheet
                key={editing?.id ?? "new"}
                notice={editing}
                open={editor.isNew || editing !== null}
                onClose={() => editor.open(null)}
            />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`删除公告“${deleting?.title ?? ""}”？`}
                desc="删除后无法恢复。只想暂时隐藏可以改为撤回。"
                confirmText="删除"
                destructive
                isLoading={action.isPending}
                handleConfirm={() =>
                    deleting &&
                    action.mutate(
                        {
                            path: `/admin/notices/${deleting.id}`,
                            method: "DELETE",
                        },
                        {
                            onSuccess: () => {
                                toast.success("公告已删除");
                                if (editor.editId === deleting.id)
                                    editor.open(null);
                                setDeleting(null);
                            },
                        },
                    )
                }
            />
        </Page>
    );
}
