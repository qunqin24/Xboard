import { useState } from "react";
import { useCommand, usePanel } from "../api/panel";
import { formatDateTime } from "../lib/format";
import { Feedback, Field, Form, TextArea } from "./forms";
import {
    Badge,
    Button,
    Card,
    CardHeader,
    EmptyState,
    Notice,
    Skeleton,
} from "./primitives";

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

/** Conversation list shared by the user centre and the admin ticket desk. */
export function TicketList({ staff = false }: { staff?: boolean }) {
    const data = usePanel<Ticket[]>("/tickets");
    const action = useCommand();
    const [filter, setFilter] = useState<"open" | "all">("open");

    if (data.isPending) return <Skeleton className="h-48" />;
    if (data.isError)
        return (
            <Notice
                tone="warn"
                title="工单加载失败"
                action={
                    <Button variant="secondary" onClick={() => data.refetch()}>
                        重试
                    </Button>
                }
            >
                {data.error.message}
            </Notice>
        );

    const tickets = data.data.filter((t) => filter === "all" || !t.closed);
    const openCount = data.data.filter((t) => !t.closed).length;

    return (
        <div className="space-y-4">
            <div
                role="group"
                aria-label="工单筛选"
                className="inline-flex rounded-md border border-line bg-surface-raised p-0.5 text-xs"
            >
                {(
                    [
                        ["open", `处理中 ${openCount}`],
                        ["all", `全部 ${data.data.length}`],
                    ] as const
                ).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={filter === key}
                        onClick={() => setFilter(key)}
                        className={`numeric cursor-pointer rounded px-3 py-1 font-medium transition-colors ${
                            filter === key
                                ? "bg-surface text-ink shadow-card"
                                : "text-ink-muted hover:text-ink"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tickets.length === 0 ? (
                <EmptyState
                    title={
                        filter === "open" ? "没有处理中的工单" : "还没有工单"
                    }
                >
                    {staff
                        ? "用户提交的工单会出现在这里。"
                        : "遇到问题时，可以在左侧提交工单。"}
                </EmptyState>
            ) : null}

            {tickets.map((ticket) => (
                <Card key={ticket.id} padded={false}>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-medium text-ink">
                                    {ticket.subject}
                                </h3>
                                <Badge
                                    dot
                                    tone={ticket.closed ? "neutral" : "success"}
                                >
                                    {ticket.closed ? "已关闭" : "处理中"}
                                </Badge>
                            </div>
                            <p className="numeric mt-1 text-xs text-ink-muted">
                                #{ticket.id}
                                {staff ? ` · ${ticket.user.email}` : ""}
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={action.isPending}
                            onClick={() =>
                                action.mutate({
                                    path: `/tickets/${ticket.id}/status`,
                                    body: { closed: !ticket.closed },
                                })
                            }
                        >
                            {ticket.closed ? "重新打开" : "关闭工单"}
                        </Button>
                    </div>

                    <ol className="space-y-3 px-5 py-4">
                        {ticket.messages.map((message) => {
                            const mine = staff === message.isStaff;
                            return (
                                <li
                                    key={message.id}
                                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-lg border px-3.5 py-2.5 ${
                                            message.isStaff
                                                ? "border-line bg-surface-raised"
                                                : "border-line bg-surface"
                                        }`}
                                    >
                                        <p className="flex items-center gap-2 text-xs text-ink-muted">
                                            <span className="font-medium text-ink">
                                                {message.isStaff
                                                    ? "客服"
                                                    : "用户"}
                                            </span>
                                            <span className="numeric">
                                                {formatDateTime(
                                                    message.createdAt,
                                                )}
                                            </span>
                                        </p>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                                            {message.content}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>

                    {!ticket.closed ? (
                        <div className="border-t border-line-subtle px-5 py-4">
                            <Form
                                busy={action.isPending}
                                label="发送回复"
                                variant="secondary"
                                submit={(form) =>
                                    action.mutate({
                                        path: `/tickets/${ticket.id}/reply`,
                                        body: Object.fromEntries(form),
                                    })
                                }
                            >
                                <TextArea
                                    label="回复"
                                    name="content"
                                    rows={3}
                                />
                            </Form>
                        </div>
                    ) : null}
                </Card>
            ))}
            <Feedback error={action.error} />
        </div>
    );
}

export function NewTicketCard() {
    const action = useCommand();
    return (
        <Card>
            <CardHeader
                title="提交新工单"
                description="描述问题和出现时间，客服会在这里回复。"
            />
            <div className="mt-4">
                <Form
                    busy={action.isPending}
                    label="提交工单"
                    submit={(form) =>
                        action.mutate({
                            path: "/tickets",
                            body: Object.fromEntries(form),
                        })
                    }
                >
                    <Field
                        label="主题"
                        name="subject"
                        maxLength={120}
                        required
                    />
                    <TextArea label="问题描述" name="content" />
                </Form>
                <Feedback
                    error={action.error}
                    success={action.isSuccess}
                    successText="工单已提交。"
                />
            </div>
        </Card>
    );
}
