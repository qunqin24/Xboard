import "@tanstack/react-table";

declare module "@tanstack/react-table" {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData, TValue> {
        className?: string; // apply to both th and td
        tdClassName?: string;
        thClassName?: string;
        /** Column title for CSV export and the column menu. */
        title?: string;
        /** Value written to CSV; columns without it (and without an accessor) are skipped. */
        exportValue?: (
            row: TData,
        ) => string | number | bigint | boolean | null | undefined;
    }
}
