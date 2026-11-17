import {
    ArrowRight,
    Desktop,
    HardDrives,
    MagnifyingGlass,
    Moon,
    Package,
    Plus,
    Sun,
    User,
    type Icon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePanel } from "../api/panel";
import { setTheme } from "../lib/theme";
import { NAV } from "./nav";
import type { NodeRow, PlanRow, UserRow } from "./types";

type Command = {
    id: string;
    group: string;
    label: string;
    hint?: string;
    icon: Icon;
    keywords?: string;
    run: () => void;
};

const match = (command: Command, term: string) =>
    !term ||
    `${command.label} ${command.hint ?? ""} ${command.keywords ?? ""}`
        .toLowerCase()
        .includes(term);

/** ⌘K / Ctrl+K palette: jump to pages, run quick actions, find records. */
export function CommandMenu({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const navigate = useNavigate();
    const dialog = useRef<HTMLDialogElement>(null);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const users = usePanel<UserRow[]>("/admin/users", { enabled: open });
    const plans = usePanel<PlanRow[]>("/admin/plans", { enabled: open });
    const nodes = usePanel<NodeRow[]>("/admin/nodes", { enabled: open });

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() === "k" &&
                (event.metaKey || event.ctrlKey)
            ) {
                event.preventDefault();
                onOpenChange(!open);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onOpenChange]);

    useEffect(() => {
        const element = dialog.current;
        if (!element) return;
        if (open && !element.open) {
            setQuery("");
            setActive(0);
            element.showModal();
        }
        if (!open && element.open) element.close();
    }, [open]);

    const term = query.trim().toLowerCase();
    const commands = useMemo(() => {
        const close = (action: () => void) => () => {
            onOpenChange(false);
            action();
        };
        const list: Command[] = [
            ...NAV.flatMap((group) =>
                group.items.map((item) => ({
                    id: `nav:${item.to}`,
                    group: "页面",
                    label: item.label,
                    hint: group.label,
                    icon: item.icon,
                    keywords: item.keywords,
                    run: close(() => void navigate({ to: item.to })),
                })),
            ),
            {
                id: "new:plan",
                group: "操作",
                label: "新建套餐",
                icon: Plus,
                keywords: "create plan",
                run: close(
                    () =>
                        void navigate({
                            to: "/admin/plans",
                            search: { new: true },
                        }),
                ),
            },
            {
                id: "new:node",
                group: "操作",
                label: "新建节点",
                icon: Plus,
                keywords: "create node",
                run: close(
                    () =>
                        void navigate({
                            to: "/admin/nodes",
                            search: { new: true },
                        }),
                ),
            },
            {
                id: "new:notice",
                group: "操作",
                label: "发布公告",
                icon: Plus,
                keywords: "create notice",
                run: close(
                    () =>
                        void navigate({
                            to: "/admin/notices",
                            search: { new: true },
                        }),
                ),
            },
            {
                id: "theme:light",
                group: "主题",
                label: "浅色主题",
                icon: Sun,
                keywords: "theme light",
                run: close(() => setTheme("light")),
            },
            {
                id: "theme:dark",
                group: "主题",
                label: "深色主题",
                icon: Moon,
                keywords: "theme dark",
                run: close(() => setTheme("dark")),
            },
            {
                id: "theme:system",
                group: "主题",
                label: "跟随系统主题",
                icon: Desktop,
                keywords: "theme system",
                run: close(() => setTheme("system")),
            },
        ];
        // Records only show while searching, to keep the default list short.
        if (term) {
            for (const user of users.data ?? [])
                list.push({
                    id: `user:${user.id}`,
                    group: "用户",
                    label: user.email,
                    hint: `#${user.id}`,
                    icon: User,
                    keywords: String(user.id),
                    run: close(
                        () =>
                            void navigate({
                                to: "/admin/users",
                                search: { user: user.id },
                            }),
                    ),
                });
            for (const plan of plans.data ?? [])
                list.push({
                    id: `plan:${plan.id}`,
                    group: "套餐",
                    label: plan.name,
                    hint: `#${plan.id}`,
                    icon: Package,
                    run: close(
                        () =>
                            void navigate({
                                to: "/admin/plans",
                                search: { edit: plan.id },
                            }),
                    ),
                });
            for (const node of nodes.data ?? [])
                list.push({
                    id: `node:${node.id}`,
                    group: "节点",
                    label: node.name,
                    hint: `${node.host}:${node.port}`,
                    icon: HardDrives,
                    keywords: node.protocol,
                    run: close(
                        () =>
                            void navigate({
                                to: "/admin/nodes",
                                search: { edit: node.id },
                            }),
                    ),
                });
        }
        const filtered = list.filter((command) => match(command, term));
        // Cap each record group so one long list cannot bury the others.
        const counts = new Map<string, number>();
        return filtered.filter((command) => {
            const count = (counts.get(command.group) ?? 0) + 1;
            counts.set(command.group, count);
            return (
                ["页面", "操作", "主题"].includes(command.group) || count <= 6
            );
        });
    }, [term, users.data, plans.data, nodes.data, navigate, onOpenChange]);

    useEffect(() => setActive(0), [term]);
    useEffect(() => {
        dialog.current
            ?.querySelector(`[data-index="${active}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const groups = commands.reduce<
        Record<string, { command: Command; index: number }[]>
    >((acc, command, index) => {
        (acc[command.group] ??= []).push({ command, index });
        return acc;
    }, {});

    return (
        <dialog
            ref={dialog}
            className="app-dialog"
            style={{
                width: "min(36rem, calc(100vw - 2rem))",
                marginTop: "12vh",
            }}
            aria-label="命令面板"
            onClose={() => onOpenChange(false)}
            onClick={(event) => {
                if (event.target === dialog.current) onOpenChange(false);
            }}
        >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
                <MagnifyingGlass
                    aria-hidden
                    className="size-4 shrink-0 text-ink-subtle"
                />
                <input
                    autoFocus
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="command-list"
                    aria-activedescendant={
                        commands[active] ? `command-${active}` : undefined
                    }
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (
                            event.key === "ArrowDown" ||
                            event.key === "ArrowUp"
                        ) {
                            event.preventDefault();
                            const step = event.key === "ArrowDown" ? 1 : -1;
                            setActive((index) =>
                                commands.length
                                    ? (index + step + commands.length) %
                                      commands.length
                                    : 0,
                            );
                        } else if (event.key === "Enter") {
                            event.preventDefault();
                            commands[active]?.run();
                        }
                    }}
                    placeholder="搜索页面、操作、用户、套餐、节点…"
                    className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
                />
                <kbd className="numeric rounded border border-line px-1.5 text-[11px] text-ink-subtle">
                    Esc
                </kbd>
            </div>
            <div
                id="command-list"
                role="listbox"
                className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5"
            >
                {commands.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-ink-muted">
                        没有找到“{query}”
                    </p>
                ) : null}
                {Object.entries(groups).map(([group, items]) => (
                    <div
                        key={group}
                        role="group"
                        aria-label={group}
                        className="mb-1"
                    >
                        <p className="px-2.5 pt-2 pb-1 text-xs font-medium text-ink-subtle">
                            {group}
                        </p>
                        {items.map(({ command, index }) => (
                            <div
                                key={command.id}
                                id={`command-${index}`}
                                data-index={index}
                                role="option"
                                aria-selected={index === active}
                                onMouseMove={() => setActive(index)}
                                onClick={command.run}
                                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                                    index === active
                                        ? "bg-surface-subtle text-ink"
                                        : "text-ink-muted"
                                }`}
                            >
                                <command.icon
                                    aria-hidden
                                    className="size-4 shrink-0"
                                />
                                <span className="flex-1 truncate text-ink">
                                    {command.label}
                                </span>
                                {command.hint ? (
                                    <span className="numeric truncate text-xs text-ink-subtle">
                                        {command.hint}
                                    </span>
                                ) : null}
                                {index === active ? (
                                    <ArrowRight
                                        aria-hidden
                                        className="size-3.5 text-ink-subtle"
                                    />
                                ) : null}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-subtle">
                <span>↑↓ 选择</span>
                <span>Enter 打开</span>
                <span className="ml-auto">
                    输入关键字可搜索用户、套餐、节点
                </span>
            </div>
        </dialog>
    );
}
