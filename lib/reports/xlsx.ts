import ExcelJS from "exceljs";
import { formatValue, isNumeric } from "./definitions";
import { toHours } from "./aggregate";
import type { ReportColumn, ReportRow, ReportValue } from "./types";

export interface ExportHeader {
  company: string;
  title: string;
  /** "01 Oct 2026 – 31 Oct 2026" */
  period: string;
  /** "04 Nov 2026, 10:15 AM IST" */
  generatedAt: string;
}

const headerLabel = (c: ReportColumn) => (c.kind === "duration" ? `${c.label} (h)` : c.label);

/** Typed Excel value: real dates, hours as numbers, clock times as text. */
function excelValue(c: ReportColumn, v: ReportValue): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (c.kind) {
    case "date":
      return new Date(`${v}T00:00:00.000Z`);
    case "duration":
      return toHours(Number(v));
    case "pct":
      return Number(v) / 100;
    case "int":
    case "days":
      return Number(v);
    default:
      return formatValue(c.kind, v, c.key);
  }
}

const NUM_FMT: Partial<Record<ReportColumn["kind"], string>> = { date: "dd mmm yyyy", duration: "0.00", pct: "0%", days: "0.##" };

/** One-sheet workbook for a report: title block, header row with filter, frozen panes, totals. */
export function reportWorkbook(h: ExportHeader, columns: ReportColumn[], rows: ReportRow[], totals: ReportRow | null): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = h.company;
  wb.created = new Date();
  const ws = wb.addWorksheet(h.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 5 }], pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });

  ws.getCell(1, 1).value = h.company;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(2, 1).value = h.title;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.getCell(3, 1).value = `Period: ${h.period} · Generated ${h.generatedAt}`;
  ws.getCell(3, 1).font = { size: 10, color: { argb: "FF6B685F" } };

  const head = ws.getRow(5);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = headerLabel(c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECE9E1" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB5B1A6" } } };
    cell.alignment = { horizontal: isNumeric(c.kind) ? "right" : "left", vertical: "middle" };
  });

  rows.forEach((r, ri) => {
    const row = ws.getRow(6 + ri);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = excelValue(c, r[c.key] ?? null);
      const fmt = NUM_FMT[c.kind];
      if (fmt) cell.numFmt = fmt;
      if (isNumeric(c.kind)) cell.alignment = { horizontal: "right" };
    });
  });

  if (totals && rows.length) {
    const row = ws.getRow(6 + rows.length);
    row.getCell(1).value = "Total";
    columns.forEach((c, i) => {
      if (i === 0 || totals[c.key] === undefined) return;
      const cell = row.getCell(i + 1);
      cell.value = excelValue(c, totals[c.key] ?? null);
      const fmt = NUM_FMT[c.kind];
      if (fmt) cell.numFmt = fmt;
      cell.alignment = { horizontal: "right" };
    });
    row.font = { bold: true };
    row.eachCell((cell) => (cell.border = { top: { style: "thin", color: { argb: "FFB5B1A6" } } }));
  }

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: columns.length } };
  columns.forEach((c, i) => {
    const longest = Math.max(headerLabel(c).length, ...rows.slice(0, 500).map((r) => formatValue(c.kind, r[c.key] ?? null, c.key).length));
    ws.getColumn(i + 1).width = Math.min(40, Math.max(8, longest + 2));
  });
  return wb;
}
