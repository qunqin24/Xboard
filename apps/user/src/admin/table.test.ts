import { describe, expect, it } from "vitest";
import {
    compareValues,
    countBy,
    csvCell,
    filterRows,
    paginate,
    sortRows,
    toCsv,
} from "./table";

describe("compareValues", () => {
    it("orders numbers, bigints and Chinese text, with empties last", () => {
        expect(compareValues(2, 10)).toBeLessThan(0);
        expect(compareValues(10n ** 15n, 2n)).toBeGreaterThan(0);
        expect(compareValues("节点 2", "节点 10")).toBeLessThan(0);
        expect(compareValues(null, 1)).toBeGreaterThan(0);
        expect(compareValues("", "a")).toBeGreaterThan(0);
    });
});

describe("sortRows", () => {
    const rows = [
        { id: 1, v: 3 },
        { id: 2, v: null },
        { id: 3, v: 1 },
        { id: 4, v: 3 },
    ];
    it("sorts both ways, keeps ties stable and empties at the bottom", () => {
        expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.id)).toEqual([
            3, 1, 4, 2,
        ]);
        expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.id)).toEqual([
            1, 4, 3, 2,
        ]);
    });
    it("does not mutate the input", () => {
        sortRows(rows, (r) => r.v, "asc");
        expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    });
});

describe("filterRows", () => {
    const rows = [
        { email: "A@x.test", status: "paid" },
        { email: "b@x.test", status: "pending" },
        { email: "c@y.test", status: "paid" },
    ];
    it("combines case-insensitive search with facet selections", () => {
        const result = filterRows(rows, {
            search: "X.TEST",
            searchText: (r) => r.email,
            facets: [{ value: (r) => r.status, selected: new Set(["paid"]) }],
        });
        expect(result.map((r) => r.email)).toEqual(["A@x.test"]);
    });
    it("treats an empty facet selection as no filter", () => {
        expect(
            filterRows(rows, {
                search: "",
                facets: [{ value: (r) => r.status, selected: new Set() }],
            }),
        ).toHaveLength(3);
    });
    it("counts facet values", () => {
        expect(countBy(rows, (r) => r.status).get("paid")).toBe(2);
    });
});

describe("paginate", () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    it("slices pages and clamps out-of-range pages", () => {
        expect(paginate(rows, 3, 20)).toMatchObject({
            page: 3,
            pageCount: 3,
            rows: [40, 41, 42, 43, 44],
        });
        expect(paginate(rows, 9, 20).page).toBe(3);
        expect(paginate([], 1, 20)).toMatchObject({
            page: 1,
            pageCount: 1,
            rows: [],
        });
    });
});

describe("CSV", () => {
    it("quotes separators and doubles quotes", () => {
        expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
        expect(csvCell(null)).toBe("");
        expect(csvCell(12)).toBe("12");
    });
    it("neutralises spreadsheet formulas", () => {
        expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
        expect(csvCell("+1")).toBe("'+1");
        expect(csvCell("-2")).toBe("'-2");
        expect(csvCell("@cmd")).toBe("'@cmd");
        expect(csvCell(-1990)).toBe("-1990");
    });
    it("joins rows with CRLF", () => {
        expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"');
    });
});
