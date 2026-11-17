import type { Workbook, Worksheet } from "exceljs";
import { classifyRemark, isWeekdayName, minutesLabel, parseDateCell, parseTimeCell, plainValue, type RemarkStatus } from "./cells";
import { nameKey, nameSimilarity } from "./name-match";

export type IssueKind =
  | "AMPM_FIXED"
  | "UNREADABLE_TIME"
  | "MISSING_OUT"
  | "MISSING_IN"
  | "UNCLEAR_REMARK"
  | "UNUSUAL_TIME"
  | "BAD_DATE"
  | "DUPLICATE_DATE"
  | "NO_HEADER";

export const ISSUE_LABEL: Record<IssueKind, string> = {
  AMPM_FIXED: "AM/PM auto-fixed",
  UNREADABLE_TIME: "Unreadable time",
  MISSING_OUT: "Missing out time",
  MISSING_IN: "Missing in time",
  UNCLEAR_REMARK: "Unclear remark",
  UNUSUAL_TIME: "Unusual in time",
  BAD_DATE: "Unreadable date",
  DUPLICATE_DATE: "Duplicate date",
  NO_HEADER: "Sheet skipped",
};

/** What each issue means for the import (shown in the preview). */
export const ISSUE_EFFECT: Record<IssueKind, string> = {
  AMPM_FIXED: "Imported with the corrected time.",
  UNREADABLE_TIME: "That time is left out; the text is kept as a remark.",
  MISSING_OUT: "Imported as a missing punch-out.",
  MISSING_IN: "The out time is kept; the day has no in time.",
  UNCLEAR_REMARK: "Kept as a remark. With no times the day counts as absent unless you fix it later.",
  UNUSUAL_TIME: "Imported as written. Check it.",
  BAD_DATE: "This row is skipped.",
  DUPLICATE_DATE: "Only the first row for this date is imported.",
  NO_HEADER: "No 'Date | In | Out | Remarks' header found, so nothing on this sheet is imported.",
};

export interface ParsedIssue {
  kind: IssueKind;
  sheet: string;
  row: number;
  cell?: string;
  date: string | null;
  name: string | null;
  message: string;
}

export interface ParsedEntry {
  person: string;
  date: string;
  sheet: string;
  row: number;
  in: number | null;
  out: number | null;
  remark: string | null;
  status: RemarkStatus | null;
}

export interface ParsedPerson {
  key: string;
  names: string[];
  sheets: string[];
  /** First and last dates of the sheets they appear in */
  firstSeen: string;
  lastSeen: string;
  firstWorked: string | null;
  lastWorked: string | null;
  daysWithData: number;
}

export interface OffDay {
  date: string;
  label: string;
  kind: "WEEKLY_OFF" | "HOLIDAY";
  sheet: string;
}

export interface ParsedWorkbook {
  sheets: { name: string; from: string | null; to: string | null; people: number; rows: number; skipped: boolean }[];
  people: ParsedPerson[];
  entries: ParsedEntry[];
  offDays: OffDay[];
  issues: ParsedIssue[];
  firstDate: string | null;
  latestDate: string | null;
}

interface Group {
  name: string;
  inCol: number;
  outCol: number | null;
  remarkCol: number | null;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? "" : String(v).trim());
const colLetter = (c: number) => {
  let s = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function cell(ws: Worksheet, row: number, col: number) {
  return plainValue(ws.getRow(row).getCell(col).value);
}

/** Finds the "Date | In | Out | Remarks" header and the person groups under the name row. */
function findLayout(ws: Worksheet): { headerRow: number; dateCol: number; groups: Group[] } | null {
  const maxCol = Math.min(ws.columnCount, 200);
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    let dateCol = 0;
    const groups: Group[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const h = text(cell(ws, r, c)).toLowerCase();
      if (h === "date" && !dateCol) dateCol = c;
      if (h === "in" || h === "in time" || h === "intime") {
        const next = (k: number) => text(cell(ws, r, c + k)).toLowerCase();
        const outCol = next(1).startsWith("out") ? c + 1 : null;
        const remarkCol = outCol && next(2).startsWith("remark") ? c + 2 : null;
        // The name sits above the group (often merged across In/Out/Remarks).
        let name = "";
        for (let k = 0; k <= 2 && !name && r > 1; k++) name = text(cell(ws, r - 1, c + k));
        groups.push({ name: name.replace(/\s+/g, " "), inCol: c, outCol, remarkCol });
      }
    }
    if (dateCol && groups.length) return { headerRow: r, dateCol, groups: groups.filter((g) => g.name) };
  }
  return null;
}

/**
 * Reads the monthly attendance workbook: one sheet per month, names in the row above a
 * "Date | In | Out | Remarks" header repeated per person. Pure: no database, no clock.
 */
export function parseWorkbook(wb: Workbook): ParsedWorkbook {
  const issues: ParsedIssue[] = [];
  const entries: ParsedEntry[] = [];
  const offDays: OffDay[] = [];
  const sheets: ParsedWorkbook["sheets"] = [];
  const people = new Map<string, ParsedPerson>();
  const seenDates = new Map<string, string>(); // date -> sheet
  const aliases = new Map<string, string>(); // name key -> person key

  /** Same person across sheets even with small spelling differences. */
  const personFor = (name: string) => {
    const k = nameKey(name);
    let key = aliases.get(k);
    if (!key) {
      key = [...people.keys()].find((p) => nameSimilarity(p, k) >= 0.92) ?? k;
      aliases.set(k, key);
    }
    return key;
  };

  for (const ws of wb.worksheets) {
    if (ws.state === "hidden" || ws.state === "veryHidden") continue;
    const layout = findLayout(ws);
    if (!layout) {
      if (ws.actualRowCount > 0) {
        issues.push({ kind: "NO_HEADER", sheet: ws.name, row: 1, date: null, name: null, message: `Sheet "${ws.name}" has no Date / In / Out header.` });
        sheets.push({ name: ws.name, from: null, to: null, people: 0, rows: 0, skipped: true });
      }
      continue;
    }
    const { headerRow, dateCol, groups } = layout;
    const sheetDates: string[] = [];
    let rows = 0;

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const dateRaw = cell(ws, r, dateCol);
      const values = groups.map((g) => ({
        g,
        in: cell(ws, r, g.inCol),
        out: g.outCol ? cell(ws, r, g.outCol) : null,
        remark: g.remarkCol ? text(cell(ws, r, g.remarkCol)) : "",
      }));
      const hasData = values.some((v) => parseTimeCell(v.in).kind !== "empty" || parseTimeCell(v.out).kind !== "empty" || v.remark);
      if (dateRaw === null && !hasData) continue;

      const date = parseDateCell(dateRaw);
      if (!date) {
        if (hasData) issues.push({ kind: "BAD_DATE", sheet: ws.name, row: r, cell: `${colLetter(dateCol)}${r}`, date: null, name: null, message: `Couldn't read the date "${text(dateRaw)}".` });
        continue;
      }
      if (seenDates.has(date)) {
        issues.push({ kind: "DUPLICATE_DATE", sheet: ws.name, row: r, cell: `${colLetter(dateCol)}${r}`, date, name: null, message: `This date already appears on sheet "${seenDates.get(date)}".` });
        continue;
      }
      seenDates.set(date, ws.name);
      sheetDates.push(date);
      rows++;

      // A row where every person shows the same non-time, non-remark text is an off day
      // ("Sunday", "Labour Day"), usually typed once in a merged cell.
      const inTexts = values.map((v) => parseTimeCell(v.in)).map((p) => (p.kind === "text" ? p.text : null));
      const first = inTexts[0];
      // Everyone "on leave" the same day is the office closed (e.g. "Pongal Leave"); everyone
      // "shoot" or "WFH" still applies to each person.
      const sameForAll = first && inTexts.every((t) => t?.toLowerCase() === first.toLowerCase());
      if (sameForAll && values.length > 1 && [null, "LEAVE"].includes(classifyRemark(first))) {
        offDays.push({ date, label: first.replace(/\s+/g, " "), kind: isWeekdayName(first) ? "WEEKLY_OFF" : "HOLIDAY", sheet: ws.name });
        continue;
      }

      for (const v of values) {
        const key = personFor(v.g.name);
        let person = people.get(key);
        if (!person) {
          person = { key, names: [], sheets: [], firstSeen: date, lastSeen: date, firstWorked: null, lastWorked: null, daysWithData: 0 };
          people.set(key, person);
        }
        if (!person.names.includes(v.g.name)) person.names.push(v.g.name);
        if (!person.sheets.includes(ws.name)) person.sheets.push(ws.name);
        if (date < person.firstSeen) person.firstSeen = date;
        if (date > person.lastSeen) person.lastSeen = date;

        const where = (col: number | null) => (col ? `${colLetter(col)}${r}` : undefined);
        const base = { sheet: ws.name, row: r, date, name: v.g.name };
        const pin = parseTimeCell(v.in);
        const pout = parseTimeCell(v.out);
        let inMin = pin.kind === "time" ? pin.minutes : null;
        let outMin = pout.kind === "time" ? pout.minutes : null;

        // Text in a time cell is either a remark ("leave", "shoot") or a typo in a time.
        const remarkParts = new Set<string>();
        if (v.remark) remarkParts.add(v.remark);
        for (const [p, col, label] of [
          [pin, v.g.inCol, "in"],
          [pout, v.g.outCol, "out"],
        ] as const) {
          if (p.kind !== "text") continue;
          if (classifyRemark(p.text) || !/\d/.test(p.text)) remarkParts.add(p.text);
          else {
            issues.push({ ...base, kind: "UNREADABLE_TIME", cell: where(col), message: `Couldn't read the ${label} time "${p.text}".` });
            remarkParts.add(p.text);
          }
        }
        const remark = [...new Set([...remarkParts].map((s) => s.trim()).filter(Boolean))].join(" · ") || null;
        const status = remark ? classifyRemark(remark) : null;

        // AM/PM slips: out earlier than in.
        if (inMin !== null && outMin !== null && outMin <= inMin) {
          if (outMin < 720 && outMin + 720 > inMin) {
            issues.push({ ...base, kind: "AMPM_FIXED", cell: where(v.g.outCol), message: `Out ${minutesLabel(outMin)} is before in ${minutesLabel(inMin)}; read as ${minutesLabel(outMin + 720)}.` });
            outMin += 720;
          } else if (inMin >= 720 && inMin - 720 < outMin) {
            issues.push({ ...base, kind: "AMPM_FIXED", cell: where(v.g.inCol), message: `In ${minutesLabel(inMin)} is after out ${minutesLabel(outMin)}; read as ${minutesLabel(inMin - 720)}.` });
            inMin -= 720;
          } else {
            issues.push({ ...base, kind: "UNREADABLE_TIME", cell: where(v.g.outCol), message: `Out ${minutesLabel(outMin)} is before in ${minutesLabel(inMin)} and can't be fixed; out time left out.` });
            outMin = null;
          }
        } else if (inMin !== null && outMin === null && pin.kind === "time" && pin.ambiguous && inMin < 7 * 60) {
          // A bare early "6.30" with no AM/PM and no out time can't be checked against anything: flag it.
          issues.push({ ...base, kind: "UNUSUAL_TIME", cell: where(v.g.inCol), message: `In time ${minutesLabel(inMin)} has no AM/PM.` });
        }

        if (inMin !== null && (inMin < 6 * 60 || inMin > 15 * 60) && status !== "HALF_DAY") {
          issues.push({ ...base, kind: "UNUSUAL_TIME", cell: where(v.g.inCol), message: `In time ${minutesLabel(inMin)} is unusual. Check AM/PM.` });
        }
        if (inMin === null && outMin !== null) issues.push({ ...base, kind: "MISSING_IN", cell: where(v.g.inCol), message: `Out ${minutesLabel(outMin)} with no in time.` });
        if (inMin !== null && outMin === null && !status) issues.push({ ...base, kind: "MISSING_OUT", cell: where(v.g.outCol), message: `In ${minutesLabel(inMin)} with no out time.` });
        // "Saturday" / "Sunday" in one person's cells: an off day for them, nothing to import.
        if (inMin === null && outMin === null && remark && !status && remark.split(" · ").every(isWeekdayName)) continue;
        if (inMin === null && outMin === null && remark && !status) {
          issues.push({ ...base, kind: "UNCLEAR_REMARK", cell: where(v.g.remarkCol ?? v.g.inCol), message: `"${remark}" isn't a known remark (leave, WFH, half day, permission, shoot).` });
        }

        if (inMin === null && outMin === null && !remark) continue;
        entries.push({ person: key, date, sheet: ws.name, row: r, in: inMin, out: outMin, remark, status });
        person.daysWithData++;
        if (inMin !== null || outMin !== null || (status && status !== "LEAVE")) {
          if (!person.firstWorked || date < person.firstWorked) person.firstWorked = date;
          if (!person.lastWorked || date > person.lastWorked) person.lastWorked = date;
        }
      }
    }
    sheetDates.sort();
    sheets.push({ name: ws.name, from: sheetDates[0] ?? null, to: sheetDates.at(-1) ?? null, people: groups.length, rows, skipped: false });
  }

  const allDates = [...seenDates.keys()].sort();
  // Sheets often list the whole month ahead; the latest date is the last one with any data.
  const latestDate = entries.reduce<string | null>((max, e) => (!max || e.date > max ? e.date : max), null);

  return {
    sheets,
    people: [...people.values()].map((p) => ({ ...p, names: p.names.sort((a, b) => b.length - a.length) })),
    entries,
    offDays,
    issues,
    firstDate: allDates[0] ?? null,
    latestDate,
  };
}
