import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("CSV", () => {
    it("quotes separators and doubles quotes", () => {
        expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
        expect(csvCell(null)).toBe("");
        expect(csvCell(12)).toBe("12");
    });
    it("neutralises spreadsheet formulas in text but not numbers", () => {
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
