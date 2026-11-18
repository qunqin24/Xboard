import { Cross2Icon, DownloadIcon } from "@radix-ui/react-icons";
import { type Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv, toCsv } from "@/lib/csv";
import { DataTableFacetedFilter } from "./faceted-filter";
import { DataTableViewOptions } from "./view-options";

type DataTableToolbarProps<TData> = {
    table: Table<TData>;
    /** false hides the search box (e.g. when a facet filter covers the only text column). */
    searchPlaceholder?: string | false;
    searchKey?: string;
    /** File name prefix; enables the export button. */
    exportName?: string;
    /** Show how many loaded rows match each filter option. */
    facetCounts?: boolean;
    filters?: {
        columnId: string;
        title: string;
        options: {
            label: string;
            value: string;
            icon?: React.ComponentType<{ className?: string }>;
        }[];
    }[];
};

export function DataTableToolbar<TData>({
    table,
    searchPlaceholder = "筛选…",
    searchKey,
    exportName,
    filters = [],
    facetCounts = true,
}: DataTableToolbarProps<TData>) {
    // Exports the selected rows if any, otherwise every filtered row, in the
    // current sort order and with the currently visible columns.
    const exportRows = () => {
        const selected = table.getFilteredSelectedRowModel().rows;
        const rows = selected.length
            ? selected
            : table.getPrePaginationRowModel().rows;
        const columns = table
            .getVisibleLeafColumns()
            .filter(
                (column) =>
                    column.columnDef.meta?.exportValue || column.accessorFn,
            );
        downloadCsv(
            exportName ?? "export",
            toCsv(
                columns.map(
                    (column) => column.columnDef.meta?.title ?? column.id,
                ),
                rows.map((row) =>
                    columns.map((column) => {
                        const exportValue = column.columnDef.meta?.exportValue;
                        if (exportValue) return exportValue(row.original);
                        const value = row.getValue(column.id);
                        return typeof value === "object"
                            ? JSON.stringify(value)
                            : (value as string);
                    }),
                ),
            ),
        );
    };

    const isFiltered =
        table.getState().columnFilters.length > 0 ||
        table.getState().globalFilter;

    return (
        <div className="flex items-center justify-between">
            <div className="flex flex-1 flex-col-reverse items-start gap-inline sm:flex-row sm:items-center">
                {searchPlaceholder === false ? null : searchKey ? (
                    <Input
                        placeholder={searchPlaceholder}
                        value={
                            (table
                                .getColumn(searchKey)
                                ?.getFilterValue() as string) ?? ""
                        }
                        onChange={(event) =>
                            table
                                .getColumn(searchKey)
                                ?.setFilterValue(event.target.value)
                        }
                        className="h-8 w-40 lg:w-64"
                    />
                ) : (
                    <Input
                        placeholder={searchPlaceholder}
                        value={table.getState().globalFilter ?? ""}
                        onChange={(event) =>
                            table.setGlobalFilter(event.target.value)
                        }
                        className="h-8 w-40 lg:w-64"
                    />
                )}
                <div className="flex gap-inline">
                    {filters.map((filter) => {
                        const column = table.getColumn(filter.columnId);
                        if (!column) return null;
                        return (
                            <DataTableFacetedFilter
                                key={filter.columnId}
                                column={column}
                                title={filter.title}
                                options={filter.options}
                                showCounts={facetCounts}
                            />
                        );
                    })}
                </div>
                {isFiltered && (
                    <Button
                        variant="ghost"
                        onClick={() => {
                            table.resetColumnFilters();
                            table.setGlobalFilter("");
                        }}
                        className="h-8 px-2 lg:px-3"
                    >
                        重置
                        <Cross2Icon className="ms-2 h-4 w-4" />
                    </Button>
                )}
            </div>
            <div className="flex items-center gap-2">
                {exportName ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={exportRows}
                        title="导出所选行，未选择时导出全部筛选结果"
                    >
                        <DownloadIcon className="size-4" />
                        导出
                    </Button>
                ) : null}
                <DataTableViewOptions table={table} />
            </div>
        </div>
    );
}
