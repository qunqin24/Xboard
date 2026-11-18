import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type Row,
    type SortingState,
    type TableOptions,
    type Updater,
    type VisibilityState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { rememberCount, skeletonCount } from "@/lib/skeleton-memory";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { DataTableBulkActions } from "./bulk-actions";
import { DataTablePagination } from "./pagination";
import type { ServerTableState } from "./server-table";
import { DataTableToolbar } from "./toolbar";

/** Faceted-filter match: the cell value is one of the selected options. */
export function inFilter<TData>(
    row: Row<TData>,
    columnId: string,
    value: string[],
): boolean {
    return !value?.length || value.includes(String(row.getValue(columnId)));
}

/** Leading checkbox column used by tables with bulk actions. */
export function selectColumn<TData>(): ColumnDef<TData> {
    return {
        id: "select",
        header: ({ table }) => (
            <Checkbox
                checked={
                    table.getIsAllPageRowsSelected() ||
                    (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(value) =>
                    table.toggleAllPageRowsSelected(!!value)
                }
                aria-label="选择本页全部"
                className="translate-y-0.5"
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                onClick={(event) => event.stopPropagation()}
                aria-label="选择此行"
                className="translate-y-0.5"
            />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-10" },
    };
}

type Filter = {
    columnId: string;
    title: string;
    options: {
        label: string;
        value: string;
        icon?: React.ComponentType<{ className?: string }>;
    }[];
};

/** Widths of the placeholder lines: a little shorter than text, varied. */
const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-1/3"];

/**
 * Upstream's table recipe (toolbar + faceted filters + sortable headers +
 * pagination + bulk-action bar) behind one component, so feature pages only
 * declare columns.
 *
 * By default all state is local and `data` is the whole list. With `server`,
 * `data` is one page from the API; paging, search and facet filters are sent
 * to the server (see useServerTable), and column sorting is turned off because
 * it could only reorder the visible page.
 */
export function DataTable<TData>({
    data,
    columns,
    getRowId,
    isLoading,
    isRefreshing,
    searchPlaceholder,
    filters,
    exportName,
    entityName = "项",
    bulkActions,
    initialSorting = [],
    initialHidden = {},
    pageSize = 10,
    onRowClick,
    selectedRowId,
    emptyText = "暂无记录",
    error,
    onRetry,
    server,
}: {
    data: TData[] | undefined;
    columns: ColumnDef<TData>[];
    getRowId?: (row: TData) => string;
    isLoading?: boolean;
    /** New rows are loading while the old ones stay: dim them, keep them clickable. */
    isRefreshing?: boolean;
    searchPlaceholder?: string | false;
    filters?: Filter[];
    exportName?: string;
    entityName?: string;
    bulkActions?: (rows: TData[], clear: () => void) => ReactNode;
    initialSorting?: SortingState;
    initialHidden?: VisibilityState;
    pageSize?: number;
    onRowClick?: (row: TData) => void;
    selectedRowId?: string | null;
    /** Empty-table text or a full EmptyState (with an action). */
    emptyText?: ReactNode;
    /** A failed load; shown instead of rows so it never reads as "no records". */
    error?: unknown;
    onRetry?: () => unknown;
    server?: {
        state: ServerTableState;
        onStateChange: (state: ServerTableState) => void;
        /** Matching rows across all pages. */
        rowCount: number | undefined;
    };
}) {
    const [sorting, setSorting] = useState<SortingState>(initialSorting);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState("");
    const [columnVisibility, setColumnVisibility] =
        useState<VisibilityState>(initialHidden);
    const [rowSelection, setRowSelection] = useState({});
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

    const resolve = <T,>(updater: Updater<T>, old: T): T =>
        typeof updater === "function"
            ? (updater as (old: T) => T)(old)
            : updater;
    const local: Partial<TableOptions<TData>> = {
        state: {
            sorting,
            columnFilters,
            globalFilter,
            columnVisibility,
            rowSelection,
            pagination,
        },
        autoResetPageIndex: false,
        onSortingChange: setSorting,
        onColumnFiltersChange: (updater) => {
            setColumnFilters(updater);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
        },
        onGlobalFilterChange: (value?: string) => {
            setGlobalFilter(value ?? "");
            setPagination((p) => ({ ...p, pageIndex: 0 }));
        },
        onPaginationChange: setPagination,
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    };
    const remote: Partial<TableOptions<TData>> | undefined = server && {
        state: {
            columnFilters: server.state.filters,
            globalFilter: server.state.search,
            columnVisibility,
            rowSelection,
            pagination: {
                pageIndex: server.state.pageIndex,
                pageSize: server.state.pageSize,
            },
        },
        manualPagination: true,
        manualFiltering: true,
        enableSorting: false,
        rowCount: server.rowCount ?? 0,
        onColumnFiltersChange: (updater) =>
            server.onStateChange({
                ...server.state,
                filters: resolve(updater, server.state.filters),
                pageIndex: 0,
            }),
        onGlobalFilterChange: (value?: string) =>
            server.onStateChange({
                ...server.state,
                search: value ?? "",
                pageIndex: 0,
            }),
        onPaginationChange: (updater) =>
            server.onStateChange({
                ...server.state,
                ...resolve(updater, {
                    pageIndex: server.state.pageIndex,
                    pageSize: server.state.pageSize,
                }),
            }),
    };

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable<TData>({
        data: data ?? [],
        columns,
        getRowId,
        enableRowSelection: Boolean(bulkActions),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        ...(remote ?? local),
    });

    // After deletes or a narrower filter the current page can fall past the
    // end; move back to the last page that still has rows.
    const pageCount = table.getPageCount();
    const pageIndex = table.getState().pagination.pageIndex;
    useEffect(() => {
        if (isLoading || pageCount < 1 || pageIndex < pageCount) return;
        table.setPageIndex(pageCount - 1);
    }, [isLoading, pageCount, pageIndex, table]);

    // Skeleton rows match the number of rows shown last time, so the table
    // keeps its height when data arrives.
    const skeletonKey = `table:${exportName ?? entityName}`;
    const rowCount = table.getRowModel().rows.length;
    useEffect(() => {
        if (!isLoading) rememberCount(skeletonKey, rowCount);
    }, [isLoading, rowCount, skeletonKey]);
    // Rows that replace a skeleton fade in from the top, 40 ms apart.
    const wasLoading = useRef(false);
    const reveal = wasLoading.current && !isLoading;
    useEffect(() => {
        wasLoading.current = Boolean(isLoading);
    }, [isLoading]);
    const refreshing = useDelayedFlag(Boolean(isRefreshing) && !isLoading);

    const selectedRows = table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original);
    const columnCount = table.getVisibleLeafColumns().length;
    const clickable = (row: Row<TData>) =>
        onRowClick
            ? {
                  onClick: () => onRowClick(row.original),
                  onKeyDown: (event: React.KeyboardEvent) => {
                      if (
                          event.target === event.currentTarget &&
                          (event.key === "Enter" || event.key === " ")
                      ) {
                          event.preventDefault();
                          onRowClick(row.original);
                      }
                  },
                  tabIndex: 0,
                  className: "cursor-pointer",
              }
            : {};

    return (
        <div
            className={cn(
                "max-sm:has-[div[role='toolbar']]:mb-16",
                "flex flex-1 flex-col gap-4",
            )}
        >
            <DataTableToolbar
                table={table}
                searchPlaceholder={searchPlaceholder}
                filters={filters}
                // Export covers loaded rows only, which in server mode is one page.
                exportName={server ? undefined : exportName}
                facetCounts={!server}
            />
            <div
                className="overflow-hidden rounded-surface border"
                aria-busy={Boolean(isLoading || refreshing)}
            >
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow
                                key={headerGroup.id}
                                className="group/row"
                            >
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        colSpan={header.colSpan}
                                        className={cn(
                                            "bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted",
                                            header.column.columnDef.meta
                                                ?.className,
                                            header.column.columnDef.meta
                                                ?.thClassName,
                                        )}
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                  header.column.columnDef
                                                      .header,
                                                  header.getContext(),
                                              )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody
                        className={cn(
                            "transition-opacity duration-200",
                            refreshing && "opacity-60",
                        )}
                    >
                        {error ? (
                            <TableRow>
                                <TableCell colSpan={columnCount}>
                                    <ErrorState
                                        error={error}
                                        onRetry={onRetry}
                                    />
                                </TableCell>
                            </TableRow>
                        ) : isLoading ? (
                            Array.from(
                                { length: skeletonCount(skeletonKey, 5) },
                                (_, row) => (
                                    <TableRow
                                        key={row}
                                        className="hover:bg-transparent"
                                    >
                                        {table
                                            .getVisibleLeafColumns()
                                            .map((column, col) => (
                                                <TableCell
                                                    key={column.id}
                                                    className="h-14"
                                                >
                                                    <Skeleton
                                                        className={cn(
                                                            "h-4",
                                                            SKELETON_WIDTHS[
                                                                (row * 2 +
                                                                    col) %
                                                                    SKELETON_WIDTHS.length
                                                            ],
                                                        )}
                                                    />
                                                </TableCell>
                                            ))}
                                    </TableRow>
                                ),
                            )
                        ) : table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row, index) => {
                                const props = clickable(row);
                                return (
                                    <TableRow
                                        key={row.id}
                                        data-state={
                                            (row.getIsSelected() ||
                                                selectedRowId === row.id) &&
                                            "selected"
                                        }
                                        {...props}
                                        className={cn(
                                            "group/row",
                                            reveal && "reveal",
                                            props.className,
                                        )}
                                        style={
                                            reveal
                                                ? ({
                                                      "--reveal-index":
                                                          Math.min(index, 12),
                                                  } as React.CSSProperties)
                                                : undefined
                                        }
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                className={cn(
                                                    "bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted",
                                                    cell.column.columnDef.meta
                                                        ?.className,
                                                    cell.column.columnDef.meta
                                                        ?.tdClassName,
                                                )}
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columnCount}
                                    className="h-24 text-center text-muted-foreground hover:bg-transparent"
                                >
                                    {emptyText}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <DataTablePagination table={table} className="mt-auto" />
            {bulkActions ? (
                <DataTableBulkActions table={table} entityName={entityName}>
                    {bulkActions(selectedRows, () => table.resetRowSelection())}
                </DataTableBulkActions>
            ) : null}
        </div>
    );
}
