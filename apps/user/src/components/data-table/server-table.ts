import { useEffect, useState } from "react";
import type { ColumnFiltersState } from "@tanstack/react-table";

/** Table state that lives on the server: page, search text and facet filters. */
export type ServerTableState = {
    pageIndex: number;
    pageSize: number;
    search: string;
    filters: ColumnFiltersState;
};

/**
 * State for a server-paged DataTable plus the API query it implies.
 * Search waits 300 ms after typing stops; facet filters become
 * comma-separated values, e.g. `status=paid,pending`.
 */
export function useServerTable(pageSize = 20) {
    const [state, setState] = useState<ServerTableState>({
        pageIndex: 0,
        pageSize,
        search: "",
        filters: [],
    });
    const [search, setSearch] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setSearch(state.search.trim()), 300);
        return () => clearTimeout(timer);
    }, [state.search]);

    /** Selected values of one facet filter, joined for the query string. */
    const filter = (columnId: string) =>
        (
            state.filters.find((item) => item.id === columnId)?.value as
                string[] | undefined
        )?.join(",");

    return {
        state,
        setState,
        filter,
        query: {
            q: search,
            page: state.pageIndex + 1,
            pageSize: state.pageSize,
        },
    };
}
