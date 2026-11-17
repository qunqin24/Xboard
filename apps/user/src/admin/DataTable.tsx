import {
    ArrowDown,
    ArrowUp,
    ArrowsDownUp,
    CaretLeft,
    CaretRight,
    DotsThree,
    DownloadSimple,
    FunnelSimple,
    MagnifyingGlass,
    SlidersHorizontal,
    X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { inputClass } from "../components/forms";
import { Menu, type MenuEntry } from "../components/Menu";
import { Button, EmptyState, Notice, Skeleton } from "../components/primitives";
import {
    countBy,
    downloadCsv,
    filterRows,
    paginate,
    sortRows,
    toCsv,
    type SortState,
    type SortValue,
} from "./table";

export type Column<T> = {
    key: string;
    header: string;
    cell: (row: T) => ReactNode;
    align?: "left" | "right";
    className?: string;
    /** Makes the column sortable. */
    sortValue?: (row: T) => SortValue;
    /** Value written to CSV; defaults to sortValue. Columns with neither are not exported. */
    exportValue?: (row: T) => SortValue;
    /** Set false to keep the column out of the visibility menu. */
    hideable?: boolean;
};

export type Facet<T> = {
    key: string;
    label: string;
    value: (row: T) => string;
    /** Display labels; values seen in the data but missing here use the raw value. */
    labels?: Record<string, string>;
};

type Query<T> = {
    data?: T[];
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => unknown;
};

function readHidden(id: string): Set<string> {
    try {
        return new Set(
            JSON.parse(localStorage.getItem(`xboard-table:${id}`) ?? "[]"),
        );
    } catch {
        return new Set();
    }
}

function FacetMenu<T>({
    facet,
    rows,
    selected,
    onChange,
}: {
    facet: Facet<T>;
    rows: T[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
}) {
    const counts = useMemo(() => countBy(rows, facet.value), [rows, facet]);
    const values = [
        ...new Set([...Object.keys(facet.labels ?? {}), ...counts.keys()]),
    ].filter((value) => counts.has(value) || selected.has(value));
    const label = (value: string) => facet.labels?.[value] ?? value;

    return (
        <Menu
            width={220}
            entries={[
                ...values.map((value) => ({
                    label: label(value),
                    checked: selected.has(value),
                    hint: counts.get(value) ?? 0,
                    onToggle: () => {
                        const next = new Set(selected);
                        if (next.has(value)) next.delete(value);
                        else next.add(value);
                        onChange(next);
                    },
                })),
                ...(selected.size
                    ? ([
                          { separator: true },
                          {
                              label: "清除筛选",
                              onSelect: () => onChange(new Set()),
                          },
                      ] as MenuEntry[])
                    : []),
            ]}
            trigger={(props) => (
                <button
                    type="button"
                    {...props}
                    className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-2.5 text-xs font-medium transition-colors ${
                        selected.size
                            ? "border-line-strong bg-surface text-ink"
                            : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                    }`}
                >
                    <FunnelSimple aria-hidden className="size-3.5" />
                    {facet.label}
                    {selected.size ? (
                        <>
                            <span aria-hidden className="h-3.5 w-px bg-line" />
                            <span className="max-w-32 truncate rounded bg-surface-subtle px-1.5 py-px">
                                {selected.size > 2
                                    ? `已选 ${selected.size} 项`
                                    : [...selected].map(label).join("、")}
                            </span>
                        </>
                    ) : null}
                </button>
            )}
        />
    );
}

/**
 * Admin list table: search, faceted filters, sorting, column visibility,
 * paging, row selection with bulk actions, row menus and CSV export, all over
 * the rows the API returned (the endpoints cap lists at the most recent 200).
 */
export function DataTable<T>({
    id,
    query,
    columns,
    rowKey,
    empty,
    searchText,
    searchPlaceholder = "搜索…",
    facets = [],
    onRowClick,
    selectedKey,
    rowActions,
    bulkActions,
    exportName,
    pageSize: initialPageSize = 20,
}: {
    id: string;
    query: Query<T>;
    columns: Column<T>[];
    rowKey: (row: T) => string | number;
    empty: { title: string; description?: string };
    searchText?: (row: T) => string;
    searchPlaceholder?: string;
    facets?: Facet<T>[];
    onRowClick?: (row: T) => void;
    selectedKey?: string | number | null;
    rowActions?: (row: T) => MenuEntry[];
    bulkActions?: (rows: T[], clear: () => void) => ReactNode;
    exportName?: string;
    pageSize?: number;
}) {
    const [search, setSearch] = useState("");
    const [selectedFacets, setSelectedFacets] = useState<
        Record<string, Set<string>>
    >({});
    const [sort, setSort] = useState<SortState>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);
    const [hidden, setHidden] = useState(() => readHidden(id));
    const [checked, setChecked] = useState<Set<string | number>>(new Set());

    const all = query.data ?? [];
    const filtered = useMemo(
        () =>
            filterRows(all, {
                search,
                searchText,
                facets: facets.map((facet) => ({
                    value: facet.value,
                    selected: selectedFacets[facet.key] ?? new Set(),
                })),
            }),
        [all, search, searchText, facets, selectedFacets],
    );
    const sorted = useMemo(() => {
        const column = columns.find((c) => c.key === sort?.key);
        return sort
            ? sortRows(filtered, column?.sortValue, sort.dir)
            : filtered;
    }, [filtered, sort, columns]);
    const view = paginate(sorted, page, pageSize);

    // Filters change the row set, so restart on the first page.
    useEffect(() => setPage(1), [search, selectedFacets, pageSize]);
    // Drop selections that no longer exist after a refetch.
    useEffect(() => {
        const keys = new Set(all.map(rowKey));
        setChecked((current) => {
            const next = new Set([...current].filter((key) => keys.has(key)));
            return next.size === current.size ? current : next;
        });
    }, [all, rowKey]);

    const visible = columns.filter((column) => !hidden.has(column.key));
    const selectable = Boolean(bulkActions);
    const selectedRows = all.filter((row) => checked.has(rowKey(row)));
    const pageKeys = view.rows.map(rowKey);
    const allOnPage =
        pageKeys.length > 0 && pageKeys.every((key) => checked.has(key));
    const someOnPage = pageKeys.some((key) => checked.has(key));
    const filtering =
        search !== "" ||
        Object.values(selectedFacets).some((set) => set.size > 0);

    const toggleHidden = (key: string) => {
        const next = new Set(hidden);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setHidden(next);
        try {
            localStorage.setItem(
                `xboard-table:${id}`,
                JSON.stringify([...next]),
            );
        } catch {
            /* Visibility just won't persist. */
        }
    };

    const exportRows = (rows: T[]) => {
        const exportable = visible.filter(
            (column) => column.exportValue ?? column.sortValue,
        );
        downloadCsv(
            exportName ?? id,
            toCsv(
                exportable.map((column) => column.header),
                rows.map((row) =>
                    exportable.map((column) =>
                        (column.exportValue ?? column.sortValue)!(row),
                    ),
                ),
            ),
        );
    };

    const cycleSort = (key: string) =>
        setSort((current) =>
            current?.key !== key
                ? { key, dir: "asc" }
                : current.dir === "asc"
                  ? { key, dir: "desc" }
                  : null,
        );

    if (query.isPending)
        return (
            <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-8 w-72" />
                <Skeleton className="h-64" />
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
    if (!all.length)
        return <EmptyState title={empty.title}>{empty.description}</EmptyState>;

    const columnCount =
        visible.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {searchText ? (
                    <label className="relative block w-full sm:w-60">
                        <span className="sr-only">{searchPlaceholder}</span>
                        <MagnifyingGlass
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-subtle"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={searchPlaceholder}
                            className={`${inputClass} h-8 pl-8 text-xs`}
                        />
                    </label>
                ) : null}
                {facets.map((facet) => (
                    <FacetMenu
                        key={facet.key}
                        facet={facet}
                        rows={all}
                        selected={selectedFacets[facet.key] ?? new Set()}
                        onChange={(next) =>
                            setSelectedFacets((current) => ({
                                ...current,
                                [facet.key]: next,
                            }))
                        }
                    />
                ))}
                {filtering ? (
                    <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => {
                            setSearch("");
                            setSelectedFacets({});
                        }}
                    >
                        重置
                        <X aria-hidden className="size-3.5" />
                    </Button>
                ) : null}

                <div className="ml-auto flex items-center gap-2">
                    {exportName ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => exportRows(sorted)}
                            title="导出当前筛选结果"
                        >
                            <DownloadSimple aria-hidden className="size-3.5" />
                            导出
                        </Button>
                    ) : null}
                    <Menu
                        align="end"
                        width={180}
                        entries={[
                            { heading: "显示的列" },
                            ...columns
                                .filter((column) => column.hideable !== false)
                                .map((column) => ({
                                    label: column.header,
                                    checked: !hidden.has(column.key),
                                    onToggle: () => toggleHidden(column.key),
                                })),
                        ]}
                        trigger={(props) => (
                            <Button variant="secondary" size="sm" {...props}>
                                <SlidersHorizontal
                                    aria-hidden
                                    className="size-3.5"
                                />
                                列
                            </Button>
                        )}
                    />
                </div>
            </div>

            {selectable && selectedRows.length ? (
                <div className="animate-pop-in flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs">
                    <span className="numeric font-medium text-ink">
                        已选 {selectedRows.length} 项
                    </span>
                    <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => setChecked(new Set())}
                    >
                        取消选择
                    </Button>
                    <span aria-hidden className="h-4 w-px bg-line" />
                    {bulkActions!(selectedRows, () => setChecked(new Set()))}
                    {exportName ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => exportRows(selectedRows)}
                        >
                            <DownloadSimple aria-hidden className="size-3.5" />
                            导出所选
                        </Button>
                    ) : null}
                </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b border-line bg-surface-raised">
                                {selectable ? (
                                    <th
                                        scope="col"
                                        className="w-10 px-4 py-2.5"
                                    >
                                        <input
                                            type="checkbox"
                                            aria-label="选择本页全部行"
                                            checked={allOnPage}
                                            ref={(element) => {
                                                if (element)
                                                    element.indeterminate =
                                                        someOnPage &&
                                                        !allOnPage;
                                            }}
                                            onChange={() =>
                                                setChecked((current) => {
                                                    const next = new Set(
                                                        current,
                                                    );
                                                    for (const key of pageKeys)
                                                        if (allOnPage)
                                                            next.delete(key);
                                                        else next.add(key);
                                                    return next;
                                                })
                                            }
                                            className="size-4 align-middle"
                                        />
                                    </th>
                                ) : null}
                                {visible.map((column) => {
                                    const active = sort?.key === column.key;
                                    return (
                                        <th
                                            key={column.key}
                                            scope="col"
                                            aria-sort={
                                                active
                                                    ? sort.dir === "asc"
                                                        ? "ascending"
                                                        : "descending"
                                                    : undefined
                                            }
                                            className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap text-ink-muted ${
                                                column.align === "right"
                                                    ? "text-right"
                                                    : ""
                                            }`}
                                        >
                                            {column.sortValue ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        cycleSort(column.key)
                                                    }
                                                    className={`-mx-1.5 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-subtle hover:text-ink ${
                                                        active ? "text-ink" : ""
                                                    }`}
                                                >
                                                    {column.header}
                                                    {active ? (
                                                        sort.dir === "asc" ? (
                                                            <ArrowUp
                                                                aria-hidden
                                                                className="size-3"
                                                            />
                                                        ) : (
                                                            <ArrowDown
                                                                aria-hidden
                                                                className="size-3"
                                                            />
                                                        )
                                                    ) : (
                                                        <ArrowsDownUp
                                                            aria-hidden
                                                            className="size-3 opacity-40"
                                                        />
                                                    )}
                                                </button>
                                            ) : (
                                                column.header
                                            )}
                                        </th>
                                    );
                                })}
                                {rowActions ? (
                                    <th
                                        scope="col"
                                        className="w-12 px-2 py-2.5"
                                    >
                                        <span className="sr-only">操作</span>
                                    </th>
                                ) : null}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-subtle">
                            {view.rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={columnCount}
                                        className="px-4 py-10 text-center text-sm text-ink-muted"
                                    >
                                        没有符合条件的记录。
                                    </td>
                                </tr>
                            ) : null}
                            {view.rows.map((row) => {
                                const key = rowKey(row);
                                const selected = selectedKey === key;
                                const isChecked = checked.has(key);
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
                                                          event.target ===
                                                              event.currentTarget &&
                                                          (event.key ===
                                                              "Enter" ||
                                                              event.key === " ")
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
                                        } ${selected || isChecked ? "bg-surface-raised" : ""}`}
                                    >
                                        {selectable ? (
                                            <td
                                                className="w-10 px-4 py-3"
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                <input
                                                    type="checkbox"
                                                    aria-label="选择此行"
                                                    checked={isChecked}
                                                    onChange={() =>
                                                        setChecked(
                                                            (current) => {
                                                                const next =
                                                                    new Set(
                                                                        current,
                                                                    );
                                                                if (
                                                                    next.has(
                                                                        key,
                                                                    )
                                                                )
                                                                    next.delete(
                                                                        key,
                                                                    );
                                                                else
                                                                    next.add(
                                                                        key,
                                                                    );
                                                                return next;
                                                            },
                                                        )
                                                    }
                                                    className="size-4 align-middle"
                                                />
                                            </td>
                                        ) : null}
                                        {visible.map((column) => (
                                            <td
                                                key={column.key}
                                                className={`px-4 py-3 align-middle whitespace-nowrap text-ink ${
                                                    column.align === "right"
                                                        ? "text-right"
                                                        : ""
                                                } ${column.className ?? ""}`}
                                            >
                                                {column.cell(row)}
                                            </td>
                                        ))}
                                        {rowActions ? (
                                            <td
                                                className="w-12 px-2 py-2 text-right"
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                <Menu
                                                    align="end"
                                                    entries={rowActions(row)}
                                                    trigger={(props) => (
                                                        <button
                                                            type="button"
                                                            {...props}
                                                            aria-label="更多操作"
                                                            className="grid size-7 cursor-pointer place-items-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink aria-expanded:bg-surface-subtle"
                                                        >
                                                            <DotsThree
                                                                aria-hidden
                                                                weight="bold"
                                                                className="size-4"
                                                            />
                                                        </button>
                                                    )}
                                                />
                                            </td>
                                        ) : null}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-2 text-xs text-ink-muted">
                    <span className="numeric">
                        {filtering
                            ? `筛选出 ${sorted.length} 条，共 ${all.length} 条`
                            : `共 ${all.length} 条`}
                    </span>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5">
                            每页
                            <select
                                value={pageSize}
                                onChange={(event) =>
                                    setPageSize(Number(event.target.value))
                                }
                                className="numeric h-7 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-xs text-ink"
                            >
                                {[10, 20, 50].map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <span className="numeric">
                            {view.page} / {view.pageCount}
                        </span>
                        <div className="flex gap-1">
                            <button
                                type="button"
                                aria-label="上一页"
                                disabled={view.page <= 1}
                                onClick={() => setPage(view.page - 1)}
                                className="grid size-7 cursor-pointer place-items-center rounded-md border border-line bg-surface text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <CaretLeft aria-hidden className="size-3.5" />
                            </button>
                            <button
                                type="button"
                                aria-label="下一页"
                                disabled={view.page >= view.pageCount}
                                onClick={() => setPage(view.page + 1)}
                                className="grid size-7 cursor-pointer place-items-center rounded-md border border-line bg-surface text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <CaretRight aria-hidden className="size-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
