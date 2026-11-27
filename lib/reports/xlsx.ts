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
  /** Letterhead (Settings → Export format); all optional */
  address?: string | null;
  logo?: { data: Buffer; format: "png" | "jpeg" } | null;
  headerNote?: string | null;
  footerNote?: string | null;
  signatures?: string[];
  orientation?: "landscape" | "portrait";
}

/**
 * Writes the letterhead (logo, company, address, title, period, note) from row 1 and returns the
 * row number for the table header.
 */
export function writeLetterhead(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, h: ExportHeader, width: number): number {
  let r = 1;
  const line = (text: string, font: Partial<ExcelJS.Font>) => {
    ws.getCell(r, 1).value = text;
    ws.getCell(r, 1).font = font;
    r++;
  };
  line(h.company, { bold: true, size: 14 });
  if (h.address) line(h.address.replace(/\s*\n\s*/g, ", "), { size: 10, color: { argb: "FF6B685F" } });
  line(h.title, { bold: true, size: 12 });
  line(`Period: ${h.period} · Generated ${h.generatedAt}`, { size: 10, color: { argb: "FF6B685F" } });
  if (h.headerNote) line(h.headerNote, { italic: true, size: 10 });
  if (h.logo) {
    const id = wb.addImage({ buffer: h.logo.data as unknown as ExcelJS.Buffer, extension: h.logo.format });
    ws.addImage(id, { tl: { col: Math.max(width - 2, 3), row: 0 }, ext: { width: 120, height: 48 }, editAs: "absolute" });
  }
  return r + 1;
}

/** Footer note and signature lines below the table, starting at `row`. */
export function writeSignOff(ws: ExcelJS.Worksheet, h: ExportHeader, row: number, width: number) {
  let r = row + 1;
  if (h.footerNote) {
    ws.getCell(r, 1).value = h.footerNote;
    ws.getCell(r, 1).font = { size: 9, color: { argb: "FF6B685F" } };
    r += 2;
  }
  const sigs = h.signatures ?? [];
  if (!sigs.length) return;
  r += 2;
  const step = Math.max(1, Math.floor(width / sigs.length));
  sigs.forEach((label, i) => {
    const col = 1 + i * step;
    ws.getCell(r, col).border = { top: { style: "thin", color: { argb: "FF17171A" } } };
    ws.getCell(r, col).value = label;
    ws.getCell(r, col).font = { size: 10 };
  });
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
    case "money":
      return Number(v);
    default:
      return formatValue(c.kind, v, c.key);
  }
}

const NUM_FMT: Partial<Record<ReportColumn["kind"], string>> = { date: "dd mmm yyyy", duration: "0.00", pct: "0%", days: "0.##", money: '"₹"#,##,##0.00' };

/** One-sheet workbook for a report: title block, header row with filter, frozen panes, totals. */
export function reportWorkbook(h: ExportHeader, columns: ReportColumn[], rows: ReportRow[], totals: ReportRow | null): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = h.company;
  wb.created = new Date();
  const ws = wb.addWorksheet(h.title.slice(0, 31), { pageSetup: { orientation: h.orientation ?? "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const H = writeLetterhead(wb, ws, h, columns.length);
  ws.views = [{ state: "frozen", ySplit: H }];

  const head = ws.getRow(H);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = headerLabel(c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECE9E1" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB5B1A6" } } };
    cell.alignment = { horizontal: isNumeric(c.kind) ? "right" : "left", vertical: "middle" };
  });

  rows.forEach((r, ri) => {
    const row = ws.getRow(H + 1 + ri);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = excelValue(c, r[c.key] ?? null);
      const fmt = NUM_FMT[c.kind];
      if (fmt) cell.numFmt = fmt;
      if (isNumeric(c.kind)) cell.alignment = { horizontal: "right" };
    });
  });

  const hasTotals = !!totals && rows.length > 0;
  if (totals && rows.length) {
    const row = ws.getRow(H + 1 + rows.length);
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

  writeSignOff(ws, h, H + rows.length + (hasTotals ? 2 : 1), columns.length);
  ws.autoFilter = { from: { row: H, column: 1 }, to: { row: H, column: columns.length } };
  columns.forEach((c, i) => {
    const longest = Math.max(headerLabel(c).length, ...rows.slice(0, 500).map((r) => formatValue(c.kind, r[c.key] ?? null, c.key).length));
    ws.getColumn(i + 1).width = Math.min(40, Math.max(8, longest + 2));
  });
  return wb;
}
