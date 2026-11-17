import { useState, type ReactNode } from "react";
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
    type VisibilityState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
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

/**
 * Upstream's table recipe (toolbar + faceted filters + sortable headers +
 * pagination + bulk-action bar) behind one component, so feature pages only
 * declare columns. All state is local; lists are the API's most recent rows.
 */
export function DataTable<TData>({
    data,
    columns,
    getRowId,
    isLoading,
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
    emptyText = "没有记录。",
}: {
    data: TData[] | undefined;
    columns: ColumnDef<TData>[];
    getRowId?: (row: TData) => string;
    isLoading?: boolean;
    searchPlaceholder?: string;
    filters?: Filter[];
    exportName?: string;
    entityName?: string;
    bulkActions?: (rows: TData[], clear: () => void) => ReactNode;
    initialSorting?: SortingState;
    initialHidden?: VisibilityState;
    pageSize?: number;
    onRowClick?: (row: TData) => void;
    selectedRowId?: string | null;
    emptyText?: string;
}) {
    const [sorting, setSorting] = useState<SortingState>(initialSorting);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState("");
    const [columnVisibility, setColumnVisibility] =
        useState<VisibilityState>(initialHidden);
    const [rowSelection, setRowSelection] = useState({});
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data: data ?? [],
        columns,
        getRowId,
        state: {
            sorting,
            columnFilters,
            globalFilter,
            columnVisibility,
            rowSelection,
            pagination,
        },
        enableRowSelection: Boolean(bulkActions),
        autoResetPageIndex: false,
        onSortingChange: setSorting,
        onColumnFiltersChange: (updater) => {
            setColumnFilters(updater);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
        },
        onGlobalFilterChange: (value) => {
            setGlobalFilter(value ?? "");
            setPagination((p) => ({ ...p, pageIndex: 0 }));
        },
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    });

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
                exportName={exportName}
            />
            <div className="overflow-hidden rounded-md border">
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
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 4 }, (_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={columnCount}>
                                        <Skeleton className="h-6" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => {
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
                                            props.className,
                                        )}
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
                                    className="h-24 text-center text-muted-foreground"
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
