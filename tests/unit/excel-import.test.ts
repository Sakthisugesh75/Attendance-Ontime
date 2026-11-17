import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { classifyRemark, parseDateCell, parseTimeCell } from "@/lib/excel/cells";
import { nameSimilarity } from "@/lib/excel/name-match";
import { parseWorkbook } from "@/lib/excel/parse-workbook";

const t = (h: number, m: number) => h * 60 + m;

describe("time cells", () => {
  it.each([
    ["09.45AM", t(9, 45)],
    ["9.45 am", t(9, 45)],
    ["6.32PM", t(18, 32)],
    ["06:30 pm", t(18, 30)],
    ["10..05AM", t(10, 5)],
    ["10AM", t(10, 0)],
    ["12.15PM", t(12, 15)],
    ["12.10AM", t(0, 10)],
    ["9.45a.m.", t(9, 45)],
    ["18:30", t(18, 30)],
  ])("reads %s", (raw, minutes) => {
    expect(parseTimeCell(raw)).toMatchObject({ kind: "time", minutes });
  });

  it("treats 0, - and blanks as empty", () => {
    expect(parseTimeCell(0)).toEqual({ kind: "empty" });
    expect(parseTimeCell("-")).toEqual({ kind: "empty" });
    expect(parseTimeCell("  ")).toEqual({ kind: "empty" });
    expect(parseTimeCell(null)).toEqual({ kind: "empty" });
  });

  it("reads Excel time fractions and Date values", () => {
    expect(parseTimeCell(0.40625)).toMatchObject({ minutes: t(9, 45) });
    expect(parseTimeCell(new Date(Date.UTC(1899, 11, 30, 18, 32)))).toMatchObject({ minutes: t(18, 32) });
  });

  it("returns text for words and impossible times", () => {
    expect(parseTimeCell("leave")).toEqual({ kind: "text", text: "leave" });
    expect(parseTimeCell("13.10PM")).toMatchObject({ kind: "text" });
    expect(parseTimeCell("9.75AM")).toMatchObject({ kind: "text" });
  });

  it("marks bare times as ambiguous", () => {
    expect(parseTimeCell("6.30")).toMatchObject({ minutes: t(6, 30), ambiguous: true });
  });
});

describe("date cells", () => {
  it.each([
    ["21.01.2026", "2026-01-21"],
    ["1/2/2026", "2026-02-01"],
    ["05-03-26", "2026-03-05"],
    ["2026-04-14", "2026-04-14"],
  ])("reads %s", (raw, ymd) => expect(parseDateCell(raw)).toBe(ymd));
  it("reads real Excel dates and serials", () => {
    expect(parseDateCell(new Date(Date.UTC(2026, 2, 1)))).toBe("2026-03-01");
    expect(parseDateCell(46082)).toBe("2026-03-01");
  });
  it("rejects impossible dates", () => {
    expect(parseDateCell("31.02.2026")).toBeNull();
    expect(parseDateCell("Sunday")).toBeNull();
  });
});

describe("remarks and names", () => {
  it.each([
    ["leave", "LEAVE"],
    ["Sick leave", "LEAVE"],
    ["WFH", "WFH"],
    ["work from home", "WFH"],
    ["Half day", "HALF_DAY"],
    ["shoot", "ON_DUTY"],
    ["Shooting at client", "ON_DUTY"],
    ["Permission 3-4pm", "PERMISSION"],
    ["came late", null],
  ])("%s -> %s", (text, status) => expect(classifyRemark(text)).toBe(status));

  it("matches names regardless of spacing, case and a trailing initial", () => {
    expect(nameSimilarity("Hariesh.S", "hariesh s")).toBe(1);
    expect(nameSimilarity("Revathi Mohan R", "Revathi Mohan")).toBeGreaterThanOrEqual(0.9);
    expect(nameSimilarity("Revathi", "Karthik")).toBeLessThan(0.5);
  });
});

/** A fictional two-month workbook in the old layout, with the usual mistakes. */
async function fixture() {
  const wb = new ExcelJS.Workbook();
  const header = (ws: ExcelJS.Worksheet, names: string[]) => {
    ws.getRow(2).getCell(1).value = "Date";
    names.forEach((n, i) => {
      const c = 2 + i * 3;
      ws.getRow(1).getCell(c).value = n;
      ws.mergeCells(1, c, 1, c + 2);
      ws.getRow(2).getCell(c).value = "In";
      ws.getRow(2).getCell(c + 1).value = "Out";
      ws.getRow(2).getCell(c + 2).value = "Remarks";
    });
  };
  const row = (ws: ExcelJS.Worksheet, r: number, date: unknown, ...cells: unknown[]) => {
    ws.getRow(r).getCell(1).value = date as ExcelJS.CellValue;
    cells.forEach((v, i) => (ws.getRow(r).getCell(2 + i).value = (v ?? null) as ExcelJS.CellValue));
  };

  const jan = wb.addWorksheet("Jan 26");
  header(jan, ["Revathi Mohan", "Imran K"]);
  row(jan, 3, "01.01.2026", "09.30AM", "06.30PM", "", "09.50AM", "6.32PM", "");
  row(jan, 4, "02.01.2026", "09.40AM", "06.10AM", "", "-", "-", "leave"); // AM/PM slip
  row(jan, 5, "03.01.2026", "01.00PM", "06.30PM", "Half day", "09.45AM", "", ""); // missing out
  row(jan, 6, "04.01.2026", "Sunday");
  jan.mergeCells(6, 2, 6, 7);
  row(jan, 7, "05.01.2026", "0", "0", "leave", "shoot", "shoot", "shoot");
  row(jan, 8, "05.01.2026", "09.30AM", "06.30PM", "", "09.30AM", "06.30PM", ""); // duplicate date
  row(jan, 9, "bad date", "09.30AM", "06.30PM", "", "", "", "");
  row(jan, 10, "06.01.2026", "09.3OAM", "06.30PM", "", "", "", "came late"); // typo + unclear remark

  const feb = wb.addWorksheet("Feb 26");
  header(feb, ["Revathi Mohan R", "Imran K"]); // initial added in a later month
  row(feb, 3, new Date(Date.UTC(2026, 1, 2)), "09.30AM", "06.30PM", "WFH", "09.35AM", "06.40PM", "");
  row(feb, 4, new Date(Date.UTC(2026, 1, 3)), "Republic Day Leave");
  feb.mergeCells(4, 2, 4, 7);
  row(feb, 5, new Date(Date.UTC(2026, 1, 28)), "", "", "", "", "", ""); // empty future row

  wb.addWorksheet("Notes").getRow(1).getCell(1).value = "Ignore me";
  return parseWorkbook(wb);
}

describe("parseWorkbook", () => {
  it("finds sheets, people and the date range", async () => {
    const p = await fixture();
    expect(p.sheets.filter((s) => !s.skipped).map((s) => s.name)).toEqual(["Jan 26", "Feb 26"]);
    expect(p.people.map((x) => x.names[0])).toEqual(["Revathi Mohan R", "Imran K"]); // merged across months
    expect(p.firstDate).toBe("2026-01-01");
    expect(p.latestDate).toBe("2026-02-02"); // last date with data, not the empty row
  });

  it("detects off-day rows: weekday names are weekly offs, other text is a holiday", async () => {
    const p = await fixture();
    expect(p.offDays).toEqual([
      expect.objectContaining({ date: "2026-01-04", kind: "WEEKLY_OFF" }),
      expect.objectContaining({ date: "2026-02-03", kind: "HOLIDAY", label: "Republic Day Leave" }),
    ]);
  });

  it("reads remarks into statuses, including text typed into the time cells", async () => {
    const p = await fixture();
    const on = (person: string, date: string) => p.entries.find((e) => e.person.startsWith(person) && e.date === date);
    expect(on("revathi", "2026-01-05")).toMatchObject({ status: "LEAVE", in: null, out: null });
    expect(on("imran", "2026-01-05")).toMatchObject({ status: "ON_DUTY", remark: "shoot" });
    expect(on("imran", "2026-01-02")).toMatchObject({ status: "LEAVE" });
    expect(on("revathi", "2026-01-03")).toMatchObject({ status: "HALF_DAY", in: t(13, 0), out: t(18, 30) });
    expect(on("revathi", "2026-02-02")).toMatchObject({ status: "WFH", in: t(9, 30) });
  });

  it("auto-fixes AM/PM slips and reports them", async () => {
    const p = await fixture();
    const fixedDay = p.entries.find((e) => e.person.startsWith("revathi") && e.date === "2026-01-02")!;
    expect(fixedDay.out).toBe(t(18, 10));
    expect(p.issues).toContainEqual(expect.objectContaining({ kind: "AMPM_FIXED", sheet: "Jan 26", cell: "C4", name: "Revathi Mohan" }));
  });

  it("reports every problem with its cell", async () => {
    const p = await fixture();
    const kinds = (k: string) => p.issues.filter((i) => i.kind === k);
    expect(kinds("MISSING_OUT")).toEqual([expect.objectContaining({ name: "Imran K", date: "2026-01-03", cell: "F5" })]);
    expect(kinds("DUPLICATE_DATE")).toEqual([expect.objectContaining({ row: 8 })]);
    expect(kinds("BAD_DATE")).toEqual([expect.objectContaining({ row: 9 })]);
    expect(kinds("UNREADABLE_TIME")).toEqual([expect.objectContaining({ cell: "B10" })]);
    expect(kinds("UNCLEAR_REMARK")).toEqual([expect.objectContaining({ name: "Imran K", date: "2026-01-06" })]);
    expect(kinds("NO_HEADER")).toEqual([expect.objectContaining({ sheet: "Notes" })]);
  });

  it("tracks first and last working days per person", async () => {
    const p = await fixture();
    const imran = p.people.find((x) => x.key.startsWith("imran"))!;
    expect(imran.firstWorked).toBe("2026-01-01");
    expect(imran.lastWorked).toBe("2026-02-02");
  });
});
