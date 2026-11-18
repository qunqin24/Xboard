import { zodResolver } from "@hookform/resolvers/zod";
import {
    Loader2,
    MessageSquarePlus,
    Search as SearchIcon,
    Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
    TICKET_MESSAGE_MAX,
    TICKET_SUBJECT_MAX,
    type Ticket,
} from "@xboard/contracts";
import { z } from "zod";
import { useCommand, usePanel, useSite } from "@/api/panel";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type { Ticket };

const newTicketSchema = z.object({
    subject: z
        .string()
        .trim()
        .min(1, "请输入主题")
        .max(TICKET_SUBJECT_MAX, `主题最多 ${TICKET_SUBJECT_MAX} 个字`),
    content: z
        .string()
        .trim()
        .min(1, "请描述问题")
        .max(TICKET_MESSAGE_MAX, `内容最多 ${TICKET_MESSAGE_MAX} 个字`),
});

export function NewTicketDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const create = useCommand();
    const site = useSite();
    const form = useForm<z.infer<typeof newTicketSchema>>({
        resolver: zodResolver(newTicketSchema),
        defaultValues: { subject: "", content: "" },
    });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>提交工单</DialogTitle>
                    <DialogDescription
                        className={
                            site.data?.supportNote ? undefined : "sr-only"
                        }
                    >
                        {site.data?.supportNote || "提交新的工单"}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        id="new-ticket"
                        className="space-y-group"
                        onSubmit={form.handleSubmit((data) =>
                            create.mutate(
                                { path: "/tickets", body: data },
                                {
                                    onSuccess: () => {
                                        toast.success("工单已提交");
                                        form.reset();
                                        onOpenChange(false);
                                        onCreated();
                                    },
                                },
                            ),
                        )}
                    >
                        <FormField
                            control={form.control}
                            name="subject"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>主题</FormLabel>
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
                                    <FormLabel>问题描述</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            rows={6}
                                            placeholder="请描述问题现象及发生时间"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </Button>
                    <Button
                        type="submit"
                        form="new-ticket"
                        disabled={create.isPending}
                    >
                        {create.isPending ? (
                            <Loader2 className="animate-spin" />
                        ) : null}
                        提交
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Ticket list + conversation. `staff` shows requester emails and replies as support. */
export function TicketDesk({ staff = false }: { staff?: boolean }) {
    // Staff work on every ticket through the admin routes; everyone else,
    // admins included, sees only their own tickets.
    const base = staff ? "/admin/tickets" : "/tickets";
    const list = usePanel<Ticket[]>(base);
    const action = useCommand();
    const [filter, setFilter] = useState<"open" | "all">("open");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [reply, setReply] = useState("");

    const tickets = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (list.data ?? []).filter(
            (t) =>
                (filter === "all" || !t.closed) &&
                (!term ||
                    `${t.subject} ${t.user.email} ${t.id}`
                        .toLowerCase()
                        .includes(term)),
        );
    }, [list.data, filter, search]);
    const selected =
        list.data?.find((t) => t.id === selectedId) ?? tickets[0] ?? null;
    useEffect(() => setReply(""), [selected?.id]);
    const openCount = list.data?.filter((t) => !t.closed).length ?? 0;

    return (
        <Card className="grid min-h-128 flex-1 gap-0 overflow-hidden p-0 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="flex flex-col border-b lg:border-e lg:border-b-0">
                <div className="flex flex-col gap-group p-4">
                    <ToggleGroup
                        type="single"
                        value={filter}
                        onValueChange={(v) => {
                            if (v) setFilter(v as "open" | "all");
                        }}
                        className="w-full"
                        aria-label="工单筛选"
                    >
                        <ToggleGroupItem value="open">
                            处理中 {openCount}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="all">
                            全部 {list.data?.length ?? 0}
                        </ToggleGroupItem>
                    </ToggleGroup>
                    <label className="relative block">
                        <SearchIcon className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={
                                staff ? "主题、邮箱或编号" : "搜索主题或编号"
                            }
                            aria-label="搜索工单"
                            className="ps-9"
                        />
                    </label>
                </div>
                <ScrollArea className="h-64 lg:h-auto lg:flex-1">
                    {list.isPending ? (
                        <div className="flex flex-col gap-1 px-4 pb-4">
                            <Skeleton className="h-14" />
                            <Skeleton className="h-14" />
                        </div>
                    ) : list.isError ? (
                        <ErrorState
                            error={list.error}
                            onRetry={() => void list.refetch()}
                        />
                    ) : tickets.length ? (
                        <ul className="flex flex-col gap-1 px-4 pb-4">
                            {tickets.map((ticket) => (
                                <li key={ticket.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(ticket.id)}
                                        aria-current={
                                            selected?.id === ticket.id
                                                ? "true"
                                                : undefined
                                        }
                                        className={cn(
                                            "w-full rounded-control px-3 py-2 text-start transition-colors hover:bg-muted",
                                            selected?.id === ticket.id &&
                                                "bg-accent text-accent-foreground hover:bg-accent",
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-inline">
                                            <span className="truncate text-sm font-medium">
                                                {ticket.subject}
                                            </span>
                                            {ticket.closed ? (
                                                <Badge variant="secondary">
                                                    已关闭
                                                </Badge>
                                            ) : filter === "all" ? (
                                                <Badge variant="info">
                                                    处理中
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="numeric mt-1 truncate text-xs text-muted-foreground">
                                            #{ticket.id}
                                            {staff
                                                ? ` · ${ticket.user.email}`
                                                : ""}{" "}
                                            ·{" "}
                                            {formatDateTime(
                                                ticket.messages.at(-1)
                                                    ?.createdAt,
                                            )}
                                        </p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <EmptyState
                            title={
                                filter === "open"
                                    ? "暂无处理中的工单"
                                    : "暂无工单"
                            }
                        />
                    )}
                </ScrollArea>
            </div>

            {selected ? (
                <div className="flex min-h-0 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-inline border-b p-4">
                        <div className="min-w-0">
                            <h3 className="truncate font-medium">
                                {selected.subject}
                            </h3>
                            <p className="numeric text-xs text-muted-foreground">
                                #{selected.id}
                                {staff ? ` · ${selected.user.email}` : ""}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={action.isPending}
                            onClick={() =>
                                action.mutate(
                                    {
                                        path: `${base}/${selected.id}/status`,
                                        body: { closed: !selected.closed },
                                    },
                                    {
                                        onSuccess: () =>
                                            toast.success(
                                                selected.closed
                                                    ? "工单已重新打开"
                                                    : "工单已关闭",
                                            ),
                                    },
                                )
                            }
                        >
                            {selected.closed ? "重新打开" : "关闭工单"}
                        </Button>
                    </div>
                    <ScrollArea className="flex-1">
                        <ol className="space-y-group p-4">
                            {selected.messages.map((message) => {
                                const mine = staff === message.isStaff;
                                return (
                                    <li
                                        key={message.id}
                                        className={cn(
                                            "flex",
                                            mine
                                                ? "justify-end"
                                                : "justify-start",
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "max-w-4/5 rounded-surface px-3 py-2",
                                                mine
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted",
                                            )}
                                        >
                                            <p className="text-sm whitespace-pre-wrap break-words">
                                                {message.content}
                                            </p>
                                            <p
                                                className={cn(
                                                    "numeric mt-1 text-xs",
                                                    mine
                                                        ? "text-primary-foreground/70"
                                                        : "text-muted-foreground",
                                                )}
                                            >
                                                {message.isStaff
                                                    ? "客服"
                                                    : staff
                                                      ? "用户"
                                                      : "我"}{" "}
                                                ·{" "}
                                                {formatDateTime(
                                                    message.createdAt,
                                                )}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </ScrollArea>
                    {selected.closed ? (
                        <p className="border-t p-4 text-center text-sm text-muted-foreground">
                            工单已关闭。重新打开后可继续回复。
                        </p>
                    ) : (
                        <form
                            className="flex items-end gap-inline border-t p-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!reply.trim()) return;
                                action.mutate(
                                    {
                                        path: `${base}/${selected.id}/reply`,
                                        body: { content: reply },
                                    },
                                    { onSuccess: () => setReply("") },
                                );
                            }}
                        >
                            <Textarea
                                value={reply}
                                onChange={(event) =>
                                    setReply(event.target.value)
                                }
                                placeholder="输入回复…"
                                rows={2}
                                maxLength={TICKET_MESSAGE_MAX}
                                className="min-h-10 resize-none"
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" &&
                                        (event.metaKey || event.ctrlKey)
                                    )
                                        event.currentTarget.form?.requestSubmit();
                                }}
                            />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="submit"
                                        disabled={
                                            action.isPending || !reply.trim()
                                        }
                                    >
                                        <Send />
                                        <span className="sr-only sm:not-sr-only">
                                            发送
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    发送（⌘ + Enter）
                                </TooltipContent>
                            </Tooltip>
                        </form>
                    )}
                </div>
            ) : list.isPending ? (
                <div className="flex flex-col gap-group p-4">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-16 w-4/5" />
                    <Skeleton className="h-16 w-4/5 self-end" />
                </div>
            ) : list.isError ? (
                <div />
            ) : (
                <EmptyState
                    className="self-center"
                    icon={MessageSquarePlus}
                    title={staff ? "选择工单以查看对话" : "暂无工单"}
                />
            )}
        </Card>
    );
}
