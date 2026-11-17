import type { AttendanceStatus } from "@prisma/client";
import type { DayFacts } from "./types";

/** Full days of work (in office, remote, on duty, or punched in without a punch-out). */
const WORKED_FULL: AttendanceStatus[] = ["PRESENT", "LATE", "PERMISSION", "WFH", "ON_DUTY", "MISSING_PUNCH_OUT"];
/** Counted in the muster's "Present" column (late days are included and also counted under "Late"). */
const PRESENT_LIKE: AttendanceStatus[] = ["PRESENT", "LATE", "PERMISSION", "MISSING_PUNCH_OUT"];

const isHalfLeave = (d: DayFacts) => d.flags.includes("HALF_DAY_LEAVE");
const leavePaid = (d: DayFacts) => d.leave?.paid ?? true;

/** Leave days a day carries: 1 for full-day leave, 0.5 for a half-day leave (with or without work). */
export function leaveUnits(d: DayFacts): number {
  if (d.status === "LEAVE") return isHalfLeave(d) ? 0.5 : 1;
  if (d.status === "HALF_DAY" && isHalfLeave(d)) return 0.5;
  return 0;
}

export interface MusterTotals {
  present: number;
  late: number;
  half: number;
  leave: number;
  wfh: number;
  od: number;
  absent: number;
  /** Absent + unpaid leave */
  lop: number;
  workedMinutes: number;
  overtimeMinutes: number;
}

/** Totals columns of the muster roll for one employee. */
export function musterTotals(days: DayFacts[]): MusterTotals {
  const t: MusterTotals = { present: 0, late: 0, half: 0, leave: 0, wfh: 0, od: 0, absent: 0, lop: 0, workedMinutes: 0, overtimeMinutes: 0 };
  for (const d of days) {
    if (d.future || !d.status) continue;
    if (PRESENT_LIKE.includes(d.status)) t.present++;
    if (d.status === "LATE") t.late++;
    if (d.status === "HALF_DAY") t.half++;
    if (d.status === "WFH") t.wfh++;
    if (d.status === "ON_DUTY") t.od++;
    if (d.status === "ABSENT") t.absent++;
    const lv = leaveUnits(d);
    t.leave += lv;
    if (lv && !leavePaid(d)) t.lop += lv;
    t.workedMinutes += d.workedMinutes;
    t.overtimeMinutes += d.overtimeMinutes;
  }
  t.lop += t.absent;
  return t;
}

export interface PayrollFigures {
  /** Days within employment that have a status (upcoming days are left out) */
  days: number;
  worked: number;
  paidLeave: number;
  unpaidLeave: number;
  holidays: number;
  weeklyOffs: number;
  absent: number;
  /** Half of every half day not covered by a half-day leave */
  halfDayLop: number;
  /** worked + paid leave + holidays + weekly offs */
  payable: number;
  /** absent + unpaid leave + half-day LOP */
  lop: number;
  overtimeMinutes: number;
}

/**
 * Payroll figures for one employee over some days. Days outside employment never count.
 * payable + lop always equals `days`.
 */
export function payrollFigures(days: DayFacts[]): PayrollFigures {
  const p: PayrollFigures = { days: 0, worked: 0, paidLeave: 0, unpaidLeave: 0, holidays: 0, weeklyOffs: 0, absent: 0, halfDayLop: 0, payable: 0, lop: 0, overtimeMinutes: 0 };
  const addLeave = (d: DayFacts, units: number) => {
    if (leavePaid(d)) p.paidLeave += units;
    else p.unpaidLeave += units;
  };
  for (const d of days) {
    if (d.future || !d.status || d.status === "NOT_JOINED" || d.status === "EXITED") continue;
    p.days++;
    p.overtimeMinutes += d.overtimeMinutes;
    switch (d.status) {
      case "HOLIDAY":
        p.holidays++;
        break;
      case "WEEKLY_OFF":
        p.weeklyOffs++;
        break;
      case "ABSENT":
        p.absent++;
        break;
      case "HALF_DAY":
        p.worked += 0.5;
        if (isHalfLeave(d)) addLeave(d, 0.5);
        else p.halfDayLop += 0.5;
        break;
      case "LEAVE":
        if (isHalfLeave(d)) {
          // Half-day leave and no (or too little) work for the other half.
          addLeave(d, 0.5);
          p.halfDayLop += 0.5;
        } else addLeave(d, 1);
        break;
      default:
        if (WORKED_FULL.includes(d.status)) p.worked++;
    }
  }
  p.payable = p.worked + p.paidLeave + p.holidays + p.weeklyOffs;
  p.lop = p.absent + p.unpaidLeave + p.halfDayLop;
  return p;
}

/** Statuses a day can be set to by HR, in menu order. */
export const OVERRIDE_ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE", "WFH", "ON_DUTY", "PERMISSION", "HOLIDAY", "WEEKLY_OFF"];

/** Minutes -> hours with 2 decimals (for Excel and payroll). */
export const toHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
