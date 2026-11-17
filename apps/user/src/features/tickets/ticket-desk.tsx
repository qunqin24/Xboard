import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus, Search as SearchIcon, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand, usePanel, useSite } from "@/api/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Ticket {
    id: number;
    subject: string;
    closed: boolean;
    user: { email: string };
    messages: {
        id: number;
        isStaff: boolean;
        content: string;
        createdAt: string;
    }[];
}

const newTicketSchema = z.object({
    subject: z
        .string()
        .trim()
        .min(1, "请输入主题")
        .max(120, "主题最多 120 个字"),
    content: z.string().trim().min(1, "请描述问题").max(10000, "内容过长"),
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
                    <DialogDescription>
                        {site.data?.supportNote ||
                            "描述问题和出现时间，客服会在这里回复。"}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        id="new-ticket"
                        className="space-y-4"
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
                                        <Textarea rows={6} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                <DialogFooter>
                    <Button
                        type="submit"
                        form="new-ticket"
                        disabled={create.isPending}
                    >
                        提交
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Ticket list + conversation. `staff` shows requester emails and replies as support. */
export function TicketDesk({ staff = false }: { staff?: boolean }) {
    const list = usePanel<Ticket[]>("/tickets");
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
        <div className="grid min-h-[32rem] flex-1 gap-4 overflow-hidden rounded-lg border lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="flex flex-col border-b lg:border-e lg:border-b-0">
                <div className="space-y-3 p-3">
                    <Tabs
                        value={filter}
                        onValueChange={(v) => setFilter(v as "open" | "all")}
                    >
                        <TabsList className="w-full">
                            <TabsTrigger value="open">
                                处理中 {openCount}
                            </TabsTrigger>
                            <TabsTrigger value="all">
                                全部 {list.data?.length ?? 0}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <label className="relative block">
                        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={
                                staff ? "主题、邮箱或编号" : "搜索工单"
                            }
                            className="h-8 ps-8"
                        />
                    </label>
                </div>
                <ScrollArea className="h-64 lg:h-auto lg:flex-1">
                    {list.isPending ? (
                        <div className="space-y-2 p-3">
                            <Skeleton className="h-14" />
                            <Skeleton className="h-14" />
                        </div>
                    ) : tickets.length ? (
                        <ul className="space-y-1 p-2">
                            {tickets.map((ticket) => (
                                <li key={ticket.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(ticket.id)}
                                        className={cn(
                                            "w-full rounded-md px-3 py-2 text-start transition-colors hover:bg-muted",
                                            selected?.id === ticket.id &&
                                                "bg-muted",
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">
                                                {ticket.subject}
                                            </span>
                                            {ticket.closed ? (
                                                <Badge variant="secondary">
                                                    已关闭
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline">
                                                    处理中
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="numeric mt-0.5 truncate text-xs text-muted-foreground">
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
                        <p className="p-6 text-center text-sm text-muted-foreground">
                            {filter === "open"
                                ? "没有处理中的工单。"
                                : "还没有工单。"}
                        </p>
                    )}
                </ScrollArea>
            </div>

            {selected ? (
                <div className="flex min-h-0 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
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
                                        path: `/tickets/${selected.id}/status`,
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
                        <ol className="space-y-3 p-4">
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
                                                "max-w-[80%] rounded-lg px-3 py-2",
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
                                                    "numeric mt-1 text-[11px]",
                                                    mine
                                                        ? "text-primary-foreground/70"
                                                        : "text-muted-foreground",
                                                )}
                                            >
                                                {message.isStaff
                                                    ? "客服"
                                                    : "用户"}{" "}
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
                        <p className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
                            工单已关闭，重新打开后可以继续回复。
                        </p>
                    ) : (
                        <form
                            className="flex items-end gap-2 border-t p-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!reply.trim()) return;
                                action.mutate(
                                    {
                                        path: `/tickets/${selected.id}/reply`,
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
                                maxLength={10000}
                                className="min-h-10 resize-none"
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" &&
                                        (event.metaKey || event.ctrlKey)
                                    )
                                        event.currentTarget.form?.requestSubmit();
                                }}
                            />
                            <Button
                                type="submit"
                                disabled={action.isPending || !reply.trim()}
                                title="发送（⌘ + Enter）"
                            >
                                <Send />
                                <span className="sr-only sm:not-sr-only">
                                    发送
                                </span>
                            </Button>
                        </form>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
                    <MessageSquarePlus className="size-8" />
                    <p className="text-sm">
                        {staff
                            ? "选择一个工单查看对话。"
                            : "有问题时可以提交工单。"}
                    </p>
                </div>
            )}
        </div>
    );
}
