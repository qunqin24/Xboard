import type { ReactNode } from "react";
import { Button, EmptyState, Notice, Skeleton } from "../components/primitives";

export type Column<T> = {
    key: string;
    header: string;
    cell: (row: T) => ReactNode;
    align?: "left" | "right";
    className?: string;
};

/** Read-only table for admin lists; handles loading, error and empty states. */
export function DataTable<T>({
    query,
    columns,
    rowKey,
    empty,
    onRowClick,
    selectedKey,
}: {
    query: {
        data?: T[];
        isPending: boolean;
        isError: boolean;
        error: Error | null;
        refetch: () => unknown;
    };
    columns: Column<T>[];
    rowKey: (row: T) => string | number;
    empty: { title: string; description?: string };
    onRowClick?: (row: T) => void;
    selectedKey?: string | number | null;
}) {
    if (query.isPending)
        return (
            <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
            </div>
        );
    if (query.isError)
        return (
            <Notice
                tone="warn"
                title="数据加载失败"
                action={
                    <Button variant="secondary" onClick={() => query.refetch()}>
                        重试
                    </Button>
                }
            >
                {query.error?.message}
            </Notice>
        );
    if (!query.data?.length)
        return <EmptyState title={empty.title}>{empty.description}</EmptyState>;

    return (
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-line bg-surface-raised">
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    scope="col"
                                    className={`whitespace-nowrap px-4 py-2.5 text-xs font-medium text-ink-muted ${
                                        column.align === "right"
                                            ? "text-right"
                                            : ""
                                    }`}
                                >
                                    {column.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                        {query.data.map((row) => {
                            const key = rowKey(row);
                            const selected = selectedKey === key;
                            return (
                                <tr
                                    key={key}
                                    onClick={
                                        onRowClick
                                            ? () => onRowClick(row)
                                            : undefined
                                    }
                                    onKeyDown={
                                        onRowClick
                                            ? (event) => {
                                                  if (
                                                      event.key === "Enter" ||
                                                      event.key === " "
                                                  ) {
                                                      event.preventDefault();
                                                      onRowClick(row);
                                                  }
                                              }
                                            : undefined
                                    }
                                    tabIndex={onRowClick ? 0 : undefined}
                                    aria-selected={
                                        onRowClick ? selected : undefined
                                    }
                                    className={`transition-colors ${
                                        onRowClick
                                            ? "cursor-pointer outline-offset-[-2px] hover:bg-surface-raised"
                                            : ""
                                    } ${selected ? "bg-surface-raised" : ""}`}
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={column.key}
                                            className={`whitespace-nowrap px-4 py-3 align-middle text-ink ${
                                                column.align === "right"
                                                    ? "text-right"
                                                    : ""
                                            } ${column.className ?? ""}`}
                                        >
                                            {column.cell(row)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="numeric border-t border-line-subtle px-4 py-2 text-xs text-ink-subtle">
                共 {query.data.length} 条
            </p>
        </div>
    );
}
