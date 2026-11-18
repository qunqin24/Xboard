import { useState, type FormEvent } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import type { HelpArticle } from "@xboard/contracts";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useCommand, usePanel } from "@/api/panel";
import { CheckRow } from "@/components/check-row";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { IconBlock } from "@/components/ui/icon-block";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tile } from "@/components/ui/tile";
import { EditorSheet } from "./editor-sheet";

function HelpEditor({
    article,
    close,
}: {
    article: HelpArticle | null;
    close: () => void;
}) {
    const save = useCommand({ inline: true });
    const flags = useForm({
        defaultValues: { published: article?.published ?? false },
    });
    const published = flags.watch("published");
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        save.mutate(
            {
                path: article ? `/admin/help/${article.id}` : "/admin/help",
                method: article ? "PUT" : "POST",
                body: {
                    title: fields.get("title"),
                    body: fields.get("body"),
                    sort: Number(fields.get("sort")),
                    published,
                },
            },
            {
                onSuccess: () => {
                    toast.success("帮助文档已保存");
                    close();
                },
            },
        );
    }
    return (
        <EditorSheet
            open
            onOpenChange={(open) => !open && close()}
            title={article ? "编辑帮助文档" : "新建帮助文档"}
            formId="help-editor"
            submitLabel="保存文档"
            pending={save.isPending}
            error={save.error}
        >
            <form
                id="help-editor"
                className="flex flex-col gap-group"
                onSubmit={submit}
            >
                <div className="grid gap-field">
                    <Label htmlFor="help-title">标题</Label>
                    <Input
                        id="help-title"
                        name="title"
                        required
                        maxLength={120}
                        defaultValue={article?.title}
                    />
                </div>
                <div className="grid gap-field">
                    <Label htmlFor="help-content">正文</Label>
                    <Textarea
                        id="help-content"
                        name="body"
                        rows={12}
                        required
                        maxLength={20_000}
                        defaultValue={article?.body}
                    />
                </div>
                <div className="grid gap-field">
                    <Label htmlFor="help-sort">排序</Label>
                    <Input
                        id="help-sort"
                        name="sort"
                        type="number"
                        min={0}
                        step={1}
                        required
                        defaultValue={article?.sort ?? 0}
                    />
                </div>
                <Form {...flags}>
                    <FormField
                        control={flags.control}
                        name="published"
                        render={({ field }) => (
                            <CheckRow
                                label="发布到用户端"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                        )}
                    />
                </Form>
            </form>
        </EditorSheet>
    );
}

export function AdminHelp() {
    const articles = usePanel<HelpArticle[]>("/admin/help");
    const remove = useCommand();
    const [edit, setEdit] = useState<HelpArticle | "new" | null>(null);
    const [deleting, setDeleting] = useState<HelpArticle | null>(null);
    return (
        <Page
            title="帮助文档"
            actions={
                <Button onClick={() => setEdit("new")}>
                    <Plus /> 新建文档
                </Button>
            }
        >
            {articles.isPending ? (
                <Skeleton className="h-48" />
            ) : articles.isError ? (
                <ErrorState
                    error={articles.error}
                    onRetry={() => articles.refetch()}
                />
            ) : articles.data.length ? (
                articles.data.map((article) => (
                    <Tile key={article.id} className="flex-wrap">
                        <IconBlock>
                            <BookOpen />
                        </IconBlock>
                        <p className="min-w-0 flex-1 wrap-anywhere font-medium">
                            {article.title}
                        </p>
                        <Badge
                            variant={
                                article.published ? "success" : "secondary"
                            }
                        >
                            {article.published ? "已发布" : "草稿"}
                        </Badge>
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`编辑 ${article.title}`}
                            onClick={() => setEdit(article)}
                        >
                            <Pencil />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`删除 ${article.title}`}
                            onClick={() => setDeleting(article)}
                        >
                            <Trash2 />
                        </Button>
                    </Tile>
                ))
            ) : (
                <EmptyState title="暂无帮助文档" />
            )}
            {edit !== null && (
                <HelpEditor
                    article={edit === "new" ? null : edit}
                    close={() => setEdit(null)}
                />
            )}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title="删除帮助文档"
                desc={`将删除《${deleting?.title ?? ""}》。`}
                confirmText="删除文档"
                destructive
                isLoading={remove.isPending}
                handleConfirm={() =>
                    deleting &&
                    remove.mutate(
                        {
                            path: `/admin/help/${deleting.id}`,
                            method: "DELETE",
                        },
                        {
                            onSuccess: () => {
                                setDeleting(null);
                                toast.success("帮助文档已删除");
                            },
                        },
                    )
                }
            />
        </Page>
    );
}
