import { STATUS_META } from "@/lib/status";
import { formatClock, formatDate, formatDuration } from "@/lib/time";
import { leaveUnits, musterTotals, payrollFigures, toHours } from "./aggregate";
import type { ColKind, DayFacts, EmployeeDays, ReportColumn, ReportRow, ReportTable, ReportValue } from "./types";

export const REPORT_KEYS = ["monthly-summary", "late-arrivals", "leave", "overtime", "working-hours", "wfh", "payroll"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_META: Record<ReportKey, { title: string; description: string; defaultSort: string; defaultDir: "asc" | "desc" }> = {
  "monthly-summary": { title: "Monthly summary", description: "Days present, late, on leave and absent per employee, with hours and overtime.", defaultSort: "name", defaultDir: "asc" },
  "late-arrivals": { title: "Late arrivals", description: "Every late arrival: shift start, punch-in and how late.", defaultSort: "date", defaultDir: "desc" },
  leave: { title: "Leave", description: "Each day on leave with its type, paid or unpaid, full or half.", defaultSort: "date", defaultDir: "desc" },
  overtime: { title: "Overtime", description: "Days with time worked beyond shift end, including work on off days.", defaultSort: "date", defaultDir: "desc" },
  "working-hours": { title: "Working hours", description: "Hours worked per employee: total, average per day, shortest and longest day.", defaultSort: "name", defaultDir: "asc" },
  wfh: { title: "Work from home", description: "Each WFH day with punch times and hours.", defaultSort: "date", defaultDir: "desc" },
  payroll: { title: "Payroll summary", description: "Per employee per month: payable days, loss-of-pay days and overtime hours.", defaultSort: "name", defaultDir: "asc" },
};

const col = (key: string, label: string, kind: ColKind): ReportColumn => ({ key, label, kind });
const EMP_COLS = [col("name", "Employee", "text"), col("code", "Code", "code"), col("department", "Department", "text")];
const emp = (e: EmployeeDays["employee"]) => ({ name: e.name, code: e.code, department: e.department });

const counted = (d: DayFacts) => !d.future && d.status !== null && d.status !== "NOT_JOINED" && d.status !== "EXITED";

function monthlySummary(list: EmployeeDays[]): ReportTable {
  return {
    columns: [
      ...EMP_COLS,
      col("present", "Present", "days"),
      col("late", "Late", "int"),
      col("half", "Half day", "int"),
      col("leave", "Leave", "days"),
      col("wfh", "WFH", "int"),
      col("od", "On duty", "int"),
      col("absent", "Absent", "int"),
      col("lop", "LOP", "days"),
      col("worked", "Hours", "duration"),
      col("avgIn", "Avg in", "clock"),
      col("overtime", "Overtime", "duration"),
      col("attendance", "Attendance", "pct"),
    ],
    rows: list.map(({ employee, days }) => {
      const t = musterTotals(days);
      const ins = days.filter((d) => counted(d) && d.inMin !== null && !d.holiday && !d.weeklyOff).map((d) => d.inMin!);
      const expected = days.filter((d) => counted(d) && d.status !== "HOLIDAY" && d.status !== "WEEKLY_OFF");
      const attended = expected.filter((d) => ["PRESENT", "LATE", "HALF_DAY", "WFH", "ON_DUTY", "PERMISSION", "MISSING_PUNCH_OUT"].includes(d.status!));
      return {
        ...emp(employee),
        present: t.present,
        late: t.late,
        half: t.half,
        leave: t.leave,
        wfh: t.wfh,
        od: t.od,
        absent: t.absent,
        lop: t.lop,
        worked: t.workedMinutes,
        avgIn: ins.length ? Math.round(ins.reduce((s, m) => s + m, 0) / ins.length) : null,
        overtime: t.overtimeMinutes,
        attendance: expected.length ? Math.round((attended.length / expected.length) * 100) : null,
      };
    }),
  };
}

function lateArrivals(list: EmployeeDays[]): ReportTable {
  const rows: ReportRow[] = [];
  for (const { employee, days } of list)
    for (const d of days)
      if (counted(d) && d.lateMinutes > 0)
        rows.push({ date: d.date, ...emp(employee), shiftStart: d.shiftStart, in: d.inMin, lateBy: d.lateMinutes, status: STATUS_META[d.status!].label });
  return {
    columns: [col("date", "Date", "date"), ...EMP_COLS, col("shiftStart", "Shift start", "clock"), col("in", "Punch in", "clock"), col("lateBy", "Late by", "duration"), col("status", "Status", "text")],
    rows,
  };
}

function leave(list: EmployeeDays[]): ReportTable {
  const rows: ReportRow[] = [];
  for (const { employee, days } of list)
    for (const d of days) {
      const units = counted(d) ? leaveUnits(d) : 0;
      if (!units) continue;
      rows.push({
        date: d.date,
        ...emp(employee),
        type: d.leave?.name ?? (d.overridden ? "Set by HR" : "Leave"),
        paid: d.leave?.paid === false ? "Unpaid" : "Paid",
        days: units,
        session: units === 1 ? "Full day" : "Half day",
        remarks: d.remarks,
      });
    }
  return {
    columns: [col("date", "Date", "date"), ...EMP_COLS, col("type", "Leave type", "text"), col("paid", "Pay", "text"), col("session", "Session", "text"), col("days", "Days", "days"), col("remarks", "Remarks", "text")],
    rows,
  };
}

function overtime(list: EmployeeDays[]): ReportTable {
  const rows: ReportRow[] = [];
  for (const { employee, days } of list)
    for (const d of days)
      if (counted(d) && d.overtimeMinutes > 0)
        rows.push({
          date: d.date,
          ...emp(employee),
          in: d.inMin,
          out: d.outMin,
          worked: d.workedMinutes,
          overtime: d.overtimeMinutes,
          kind: d.holiday ? `Holiday (${d.holiday})` : d.weeklyOff ? "Weekly off" : "After shift",
        });
  return {
    columns: [col("date", "Date", "date"), ...EMP_COLS, col("in", "Punch in", "clock"), col("out", "Punch out", "clock"), col("worked", "Worked", "duration"), col("overtime", "Overtime", "duration"), col("kind", "Type", "text")],
    rows,
  };
}

function workingHours(list: EmployeeDays[]): ReportTable {
  return {
    columns: [
      ...EMP_COLS,
      col("days", "Days with punches", "int"),
      col("total", "Total", "duration"),
      col("average", "Avg / day", "duration"),
      col("shortest", "Shortest", "duration"),
      col("longest", "Longest", "duration"),
      col("earlyCount", "Left early", "int"),
      col("earlyMinutes", "Early by", "duration"),
      col("overtime", "Overtime", "duration"),
    ],
    rows: list.map(({ employee, days }) => {
      const done = days.filter((d) => counted(d) && d.inMin !== null && d.outMin !== null && d.workedMinutes > 0);
      const mins = done.map((d) => d.workedMinutes);
      const total = mins.reduce((s, m) => s + m, 0);
      const early = days.filter((d) => counted(d) && d.earlyLeaveMinutes > 0);
      return {
        ...emp(employee),
        days: done.length,
        total,
        average: done.length ? Math.round(total / done.length) : null,
        shortest: mins.length ? Math.min(...mins) : null,
        longest: mins.length ? Math.max(...mins) : null,
        earlyCount: early.length,
        earlyMinutes: early.reduce((s, d) => s + d.earlyLeaveMinutes, 0),
        overtime: days.filter(counted).reduce((s, d) => s + d.overtimeMinutes, 0),
      };
    }),
  };
}

function wfh(list: EmployeeDays[]): ReportTable {
  const rows: ReportRow[] = [];
  for (const { employee, days } of list)
    for (const d of days)
      if (counted(d) && d.status === "WFH") rows.push({ date: d.date, ...emp(employee), in: d.inMin, out: d.outMin, worked: d.workedMinutes || null, remarks: d.remarks });
  return {
    columns: [col("date", "Date", "date"), ...EMP_COLS, col("in", "Punch in", "clock"), col("out", "Punch out", "clock"), col("worked", "Worked", "duration"), col("remarks", "Remarks", "text")],
    rows,
  };
}

function payroll(list: EmployeeDays[]): ReportTable {
  const rows: ReportRow[] = [];
  for (const { employee, days } of list) {
    const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
    for (const month of months) {
      const p = payrollFigures(days.filter((d) => d.date.startsWith(month)));
      if (!p.days) continue;
      rows.push({
        ...emp(employee),
        month,
        days: p.days,
        worked: p.worked,
        paidLeave: p.paidLeave,
        holidays: p.holidays,
        weeklyOffs: p.weeklyOffs,
        payable: p.payable,
        absent: p.absent,
        unpaidLeave: p.unpaidLeave,
        halfDayLop: p.halfDayLop,
        lop: p.lop,
        overtimeHours: toHours(p.overtimeMinutes),
      });
    }
  }
  return {
    columns: [
      ...EMP_COLS,
      col("month", "Month", "text"),
      col("days", "Days", "days"),
      col("worked", "Worked", "days"),
      col("paidLeave", "Paid leave", "days"),
      col("holidays", "Holidays", "days"),
      col("weeklyOffs", "Weekly offs", "days"),
      col("payable", "Payable", "days"),
      col("absent", "Absent", "days"),
      col("unpaidLeave", "Unpaid leave", "days"),
      col("halfDayLop", "Half-day LOP", "days"),
      col("lop", "LOP", "days"),
      col("overtimeHours", "OT hours", "days"),
    ],
    rows,
  };
}

const BUILDERS: Record<ReportKey, (list: EmployeeDays[]) => ReportTable> = {
  "monthly-summary": monthlySummary,
  "late-arrivals": lateArrivals,
  leave,
  overtime,
  "working-hours": workingHours,
  wfh,
  payroll,
};

/** Builds a report table from computed days. Pure. */
export function buildReport(key: ReportKey, list: EmployeeDays[]): ReportTable {
  return BUILDERS[key](list);
}

/** Sorts rows by a column (nulls last), then by date and name for a stable order. */
export function sortRows(rows: ReportRow[], key: string, dir: "asc" | "desc"): ReportRow[] {
  const cmp = (a: ReportValue, b: ReportValue) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
    return dir === "asc" ? r : -r;
  };
  return [...rows].sort((a, b) => cmp(a[key] ?? null, b[key] ?? null) || String(a.date ?? "").localeCompare(String(b.date ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

/** Column totals for numeric columns of summary-style reports (null when not meaningful). */
export function totalsRow(table: ReportTable): ReportRow | null {
  if (!table.rows.length) return null;
  const out: ReportRow = {};
  let any = false;
  for (const c of table.columns) {
    if (c.kind === "int" || c.kind === "days" || (c.kind === "duration" && !["average", "shortest", "longest"].includes(c.key))) {
      out[c.key] = Math.round(table.rows.reduce((s, r) => s + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0) * 100) / 100;
      any = true;
    }
  }
  return any ? out : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Display text for a cell (same in the table, the PDF and as the Excel fallback). */
export function formatValue(kind: ColKind, v: ReportValue, key?: string): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (kind) {
    case "date":
      return formatDate(String(v));
    case "clock":
      return formatClock(Number(v));
    case "duration":
      return formatDuration(Number(v));
    case "pct":
      return `${v}%`;
    case "money":
      return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "days":
    case "int":
      return Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(key === "overtimeHours" ? 2 : 1);
    default:
      if (key === "month" && /^\d{4}-\d{2}$/.test(String(v))) return `${MONTHS[Number(String(v).slice(5)) - 1]} ${String(v).slice(0, 4)}`;
      return String(v);
  }
}

/** Right-aligned numeric columns */
export const isNumeric = (kind: ColKind) => kind !== "text" && kind !== "code" && kind !== "date";
