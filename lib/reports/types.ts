import type { AttendanceStatus } from "@prisma/client";

/**
 * One employee-day reduced to plain facts (no Prisma objects, no Dates), so the
 * aggregations in this folder are pure and unit-testable.
 */
export interface DayFacts {
  date: string;
  /** Computed status (null = still open / upcoming with nothing to say) */
  status: AttendanceStatus | null;
  flags: string[];
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  /** Punch times in minutes since IST midnight of `date` */
  inMin: number | null;
  outMin: number | null;
  holiday: string | null;
  weeklyOff: boolean;
  /** Date is after today (IST) */
  future: boolean;
  /** Approved leave request covering this day, if any */
  leave: { code: string | null; name: string | null; paid: boolean; half: boolean } | null;
  remarks: string | null;
  /** Shift start for that weekday (minutes), null when the shift has no timing */
  shiftStart: number | null;
  hasRecord: boolean;
  source: "WEB" | "IMPORT" | "MANUAL" | null;
  overridden: boolean;
}

export interface EmployeeInfo {
  id: number;
  code: string;
  name: string;
  department: string | null;
}

export interface EmployeeDays {
  employee: EmployeeInfo;
  days: DayFacts[];
}

export type ColKind = "text" | "code" | "date" | "clock" | "duration" | "int" | "days" | "pct" | "money";

export interface ReportColumn {
  key: string;
  label: string;
  kind: ColKind;
}

export type ReportValue = string | number | null;
export type ReportRow = Record<string, ReportValue>;

export interface ReportTable {
  columns: ReportColumn[];
  rows: ReportRow[];
}
