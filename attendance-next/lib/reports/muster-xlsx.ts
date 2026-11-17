import ExcelJS from "exceljs";
import { STATUS_META } from "@/lib/status";
import { monthDates, WEEKDAYS, weekdayOf } from "@/lib/time";
import type { DayFacts, EmployeeDays } from "./types";

/** One person's cells for a date in the old sheet: times in minutes, remark text. */
export interface MusterXlsxCell {
  in: number | null;
  out: number | null;
  remark: string | null;
}

export interface MusterXlsxMonth {
  /** "2026-10" */
  month: string;
  /** Dates listed on the sheet, in order */
  dates: string[];
  people: { name: string; days: Record<string, MusterXlsxCell> }[];
  /** Dates that are off for everyone -> "Sunday" / holiday name (one merged cell across the row) */
  offDays: Record<string, string>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10" -> "Oct 26" */
export const sheetName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;

/** "2026-10-04" -> "04.10.2026" */
export const dottedDate = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;

/** 585 -> "09.45AM" (the way the old sheet writes times) */
export function dottedTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${pad(h % 12 || 12)}.${pad(m % 60)}${h >= 12 ? "PM" : "AM"}`;
}

/** Remark for a day: the status label for leave / WFH / on duty / permission / half day, else the record's remark. */
export function musterRemark(d: Pick<DayFacts, "status" | "remarks">): string | null {
  if (d.status && ["LEAVE", "WFH", "ON_DUTY", "PERMISSION", "HALF_DAY"].includes(d.status)) return STATUS_META[d.status].label;
  return d.remarks?.trim() || null;
}

const OFF_OR_OUTSIDE = new Set(["HOLIDAY", "WEEKLY_OFF", "NOT_JOINED", "EXITED"]);

/** Computed days -> one sheet model per month in [from, to]. Pure. */
export function musterMonths(list: EmployeeDays[], from: string, to: string): MusterXlsxMonth[] {
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
    months.push(m);
    const [y, mm] = m.split("-").map(Number) as [number, number];
    m = mm === 12 ? `${y + 1}-01` : `${y}-${pad(mm + 1)}`;
  }

  // Two people with the same name would merge on re-import: add the code.
  const counts = new Map<string, number>();
  for (const e of list) counts.set(e.employee.name, (counts.get(e.employee.name) ?? 0) + 1);
  const label = (e: EmployeeDays["employee"]) => ((counts.get(e.name) ?? 0) > 1 ? `${e.name} (${e.code})` : e.name);

  return months.map((month) => {
    const dates = monthDates(month).filter((d) => d >= from && d <= to);
    const byDate = (e: EmployeeDays) => new Map(e.days.filter((d) => d.date.startsWith(month)).map((d) => [d.date, d]));
    const people = list
      .map((e) => ({ e, days: byDate(e) }))
      .filter(({ days }) => [...days.values()].some((d) => d.status !== "NOT_JOINED" && d.status !== "EXITED"));

    const offDays: Record<string, string> = {};
    for (const date of dates) {
      const day = people.map(({ days }) => days.get(date)).filter((d): d is DayFacts => !!d);
      if (!day.length) continue;
      const off = day.every((d) => d.status !== null && OFF_OR_OUTSIDE.has(d.status) && d.inMin === null && d.outMin === null);
      const anyOff = day.find((d) => d.status === "HOLIDAY" || d.status === "WEEKLY_OFF");
      if (off && anyOff) offDays[date] = anyOff.holiday ?? WEEKDAYS[weekdayOf(date)]!;
    }

    return {
      month,
      dates,
      offDays,
      people: people.map(({ e, days }) => ({
        name: label(e.employee),
        days: Object.fromEntries(
          [...days.values()]
            .filter((d) => !d.future && d.status !== "NOT_JOINED" && d.status !== "EXITED")
            .map((d) => [d.date, { in: d.inMin, out: d.outMin, remark: musterRemark(d) }]),
        ),
      })),
    };
  });
}

const THIN = { style: "thin" as const, color: { argb: "FFBFBBB0" } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/**
 * The company's old monthly layout: one sheet per month ("Oct 26"); row 1 names merged
 * over In/Out/Remarks; row 2 "Date | In | Out | Remarks" repeated; one row per date.
 * Off days for everyone are a single merged cell ("Sunday", holiday name). The app's
 * importer (parseWorkbook) reads it back.
 */
export function buildMusterWorkbook(months: MusterXlsxMonth[], company = ""): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  if (company) wb.creator = company;
  for (const m of months) {
    const ws = wb.addWorksheet(sheetName(m.month), { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
    const lastCol = 1 + m.people.length * 3;
    ws.getColumn(1).width = 12;

    const head = ws.getRow(2);
    head.getCell(1).value = "Date";
    m.people.forEach((p, i) => {
      const c = 2 + i * 3;
      ws.getCell(1, c).value = p.name;
      ws.mergeCells(1, c, 1, c + 2);
      ws.getCell(1, c).alignment = { horizontal: "center" };
      head.getCell(c).value = "In";
      head.getCell(c + 1).value = "Out";
      head.getCell(c + 2).value = "Remarks";
      ws.getColumn(c).width = 10;
      ws.getColumn(c + 1).width = 10;
      ws.getColumn(c + 2).width = 14;
    });
    for (const r of [1, 2]) {
      const row = ws.getRow(r);
      row.font = { bold: true };
      for (let c = 1; c <= lastCol; c++) {
        row.getCell(c).border = BOX;
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECE9E1" } };
      }
    }

    m.dates.forEach((date, i) => {
      const r = 3 + i;
      const row = ws.getRow(r);
      row.getCell(1).value = dottedDate(date);
      const off = m.offDays[date];
      if (off && m.people.length) {
        row.getCell(2).value = off;
        if (lastCol > 2) ws.mergeCells(r, 2, r, lastCol);
        row.getCell(2).alignment = { horizontal: "center" };
        for (let c = 1; c <= lastCol; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1EFE8" } };
        row.getCell(2).font = { italic: true, color: { argb: "FF6B685F" } };
      } else {
        m.people.forEach((p, k) => {
          const d = p.days[date];
          if (!d) return;
          const c = 2 + k * 3;
          if (d.in !== null) row.getCell(c).value = dottedTime(d.in);
          if (d.out !== null) row.getCell(c + 1).value = dottedTime(d.out);
          if (d.remark) row.getCell(c + 2).value = d.remark;
        });
      }
      for (let c = 1; c <= lastCol; c++) row.getCell(c).border = BOX;
    });
  }
  if (!months.length) wb.addWorksheet("Empty");
  return wb;
}
