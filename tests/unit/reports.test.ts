import type { AttendanceStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { musterTotals, payrollFigures } from "@/lib/reports/aggregate";
import { buildReport, formatValue, sortRows, totalsRow } from "@/lib/reports/definitions";
import { parseReportParams, periodSlug, reportQuery } from "@/lib/reports/params";
import type { DayFacts, EmployeeDays } from "@/lib/reports/types";

function day(date: string, status: AttendanceStatus | null, extra: Partial<DayFacts> = {}): DayFacts {
  return {
    date,
    status,
    flags: [],
    workedMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    inMin: null,
    outMin: null,
    holiday: null,
    weeklyOff: false,
    future: false,
    leave: null,
    remarks: null,
    shiftStart: 570,
    hasRecord: status !== null,
    source: "WEB",
    overridden: false,
    ...extra,
  };
}

const worked = (date: string, status: AttendanceStatus, inMin: number, outMin: number, extra: Partial<DayFacts> = {}) =>
  day(date, status, { inMin, outMin, workedMinutes: outMin - inMin, ...extra });

const unpaid = { code: "LOP", name: "Loss of Pay", paid: false, half: false };
const casual = { code: "CL", name: "Casual Leave", paid: true, half: false };

/** A small October: 2 full days, 1 late, a half day, paid + unpaid leave, a half-day leave, absent, offs. */
const october: DayFacts[] = [
  day("2026-10-01", "NOT_JOINED"),
  worked("2026-10-02", "PRESENT", 570, 1110),
  worked("2026-10-03", "LATE", 600, 1110, { lateMinutes: 30 }),
  day("2026-10-04", "WEEKLY_OFF", { weeklyOff: true }),
  worked("2026-10-05", "HALF_DAY", 570, 870),
  day("2026-10-06", "LEAVE", { leave: casual }),
  day("2026-10-07", "LEAVE", { leave: unpaid }),
  day("2026-10-08", "ABSENT"),
  worked("2026-10-09", "HALF_DAY", 570, 870, { flags: ["HALF_DAY_LEAVE"], leave: { ...casual, half: true } }),
  day("2026-10-10", "LEAVE", { flags: ["HALF_DAY_LEAVE"], leave: { ...unpaid, half: true } }),
  day("2026-10-11", "HOLIDAY", { holiday: "Ayudha Puja" }),
  worked("2026-10-12", "WFH", 560, 1100),
  day("2026-10-13", "ON_DUTY"),
  worked("2026-10-14", "PRESENT", 570, 1200, { overtimeMinutes: 60 }),
  worked("2026-10-15", "MISSING_PUNCH_OUT", 575, 575, { outMin: null, workedMinutes: 0 }),
  day("2026-10-16", null, { future: true }),
  day("2026-10-17", "WEEKLY_OFF", { weeklyOff: true, future: true }),
];

describe("muster totals", () => {
  it("counts each column and leaves out upcoming days", () => {
    const t = musterTotals(october);
    expect(t).toMatchObject({ present: 4, late: 1, half: 2, wfh: 1, od: 1, absent: 1 });
    // CL 1 + LOP 1 + half CL 0.5 + half LOP 0.5
    expect(t.leave).toBe(3);
    // Absent 1 + unpaid 1 + unpaid half 0.5
    expect(t.lop).toBe(2.5);
    expect(t.overtimeMinutes).toBe(60);
    expect(t.workedMinutes).toBe(540 + 510 + 300 + 300 + 540 + 630);
  });
});

describe("payroll", () => {
  const p = payrollFigures(october);

  it("splits days into worked, leave, offs and loss of pay", () => {
    // Full: 02, 03, 12, 13, 14, 15 = 6; halves 05, 09 = 1
    expect(p.worked).toBe(7);
    expect(p.paidLeave).toBe(1.5); // 06 + half of 09
    expect(p.unpaidLeave).toBe(1.5); // 07 + half of 10
    expect(p.holidays).toBe(1);
    expect(p.weeklyOffs).toBe(1); // the upcoming one on the 17th is left out
    expect(p.absent).toBe(1);
    // 05 is a half day without leave; 10 is a half-day leave with no work for the other half.
    expect(p.halfDayLop).toBe(1);
  });

  it("payable + LOP covers every day in employment", () => {
    expect(p.payable).toBe(7 + 1.5 + 1 + 1);
    expect(p.lop).toBe(1 + 1.5 + 1);
    expect(p.payable + p.lop).toBe(p.days);
    expect(p.days).toBe(14); // 15 dated days minus not-joined, upcoming excluded
    expect(p.overtimeMinutes).toBe(60);
  });

  it("never counts days outside employment", () => {
    const q = payrollFigures([day("2026-10-01", "NOT_JOINED"), day("2026-10-02", "EXITED")]);
    expect(q.days).toBe(0);
    expect(q.payable + q.lop).toBe(0);
  });

  it("treats leave without a known type (HR override) as paid", () => {
    expect(payrollFigures([day("2026-10-06", "LEAVE", { overridden: true })]).paidLeave).toBe(1);
  });
});

const list: EmployeeDays[] = [
  { employee: { id: 1, code: "EMP002", name: "Anitha Raman", department: "Operations" }, days: october },
  {
    employee: { id: 2, code: "EMP003", name: "Karthik Selvam", department: "Creative" },
    days: [
      worked("2026-10-02", "LATE", 640, 1110, { lateMinutes: 70 }),
      worked("2026-10-03", "WFH", 560, 1100, { remarks: "Internet at office down" }),
      worked("2026-11-02", "PRESENT", 570, 1110),
    ],
  },
];

describe("reports", () => {
  it("late arrivals lists each late day with how late", () => {
    const r = buildReport("late-arrivals", list);
    expect(r.rows).toHaveLength(2);
    expect(sortRows(r.rows, "lateBy", "desc")[0]).toMatchObject({ name: "Karthik Selvam", lateBy: 70, in: 640, shiftStart: 570 });
  });

  it("leave report marks paid / unpaid and half days", () => {
    const r = buildReport("leave", list);
    expect(r.rows.map((x) => [x.date, x.paid, x.days])).toEqual([
      ["2026-10-06", "Paid", 1],
      ["2026-10-07", "Unpaid", 1],
      ["2026-10-09", "Paid", 0.5],
      ["2026-10-10", "Unpaid", 0.5],
    ]);
  });

  it("payroll has one row per employee per month", () => {
    const r = buildReport("payroll", list);
    expect(r.rows.map((x) => [x.name, x.month])).toEqual([
      ["Anitha Raman", "2026-10"],
      ["Karthik Selvam", "2026-10"],
      ["Karthik Selvam", "2026-11"],
    ]);
    expect(r.rows[0]).toMatchObject({ payable: 10.5, lop: 3.5, overtimeHours: 1 });
  });

  it("overtime, WFH and hours reports pick the right days", () => {
    expect(buildReport("overtime", list).rows).toEqual([expect.objectContaining({ date: "2026-10-14", overtime: 60, kind: "After shift" })]);
    expect(buildReport("wfh", list).rows.map((r) => r.date)).toEqual(["2026-10-12", "2026-10-03"]);
    const hours = buildReport("working-hours", list).rows[1]!;
    expect(hours).toMatchObject({ days: 3, total: 470 + 540 + 540, shortest: 470, longest: 540 });
  });

  it("monthly summary has attendance % over expected days", () => {
    const r = buildReport("monthly-summary", list).rows[0]!;
    // Expected (not off, not outside employment): 02,03,05,06,07,08,09,10,12,13,14,15 = 12; attended: 02,03,05,09,12,13,14,15 = 8
    expect(r.attendance).toBe(67);
    expect(r.avgIn).toBe(Math.round((570 + 600 + 570 + 570 + 560 + 570 + 575) / 7));
  });

  it("sorts with nulls last and totals numeric columns", () => {
    const rows = [{ a: 2 }, { a: null }, { a: 10 }];
    expect(sortRows(rows, "a", "asc").map((r) => r.a)).toEqual([2, 10, null]);
    expect(sortRows(rows, "a", "desc").map((r) => r.a)).toEqual([10, 2, null]);
    const t = totalsRow(buildReport("late-arrivals", list))!;
    expect(t.lateBy).toBe(100);
  });

  it("formats values for display", () => {
    expect(formatValue("clock", 585)).toBe("09:45 AM");
    expect(formatValue("duration", 485)).toBe("8h 05m");
    expect(formatValue("date", "2026-11-04")).toBe("04 Nov 2026");
    expect(formatValue("days", 2.5)).toBe("2.5");
    expect(formatValue("text", "2026-10", "month")).toBe("Oct 2026");
    expect(formatValue("int", null)).toBe("—");
  });
});

describe("report params", () => {
  it("defaults to this month and the report's sort", () => {
    const p = parseReportParams({}, "2026-11-04");
    expect(p).toMatchObject({ report: "monthly-summary", from: "2026-11-01", to: "2026-11-30", sort: "name", dir: "asc", page: 1, emp: [] });
  });

  it("swaps a reversed range, caps it at a year and ignores junk", () => {
    const p = parseReportParams({ report: "late-arrivals", from: "2026-10-31", to: "2026-10-01", emp: "3,x,3,5", page: "-2", dept: "abc" }, "2026-11-04");
    expect(p).toMatchObject({ from: "2026-10-01", to: "2026-10-31", emp: [3, 5], page: 1, dept: null, sort: "date", dir: "desc" });
    expect(parseReportParams({ from: "2024-01-01", to: "2026-01-01" }, "2026-11-04").to).toBe("2024-12-31");
    expect(parseReportParams({ from: "2026-02-31" }, "2026-11-04").from).toBe("2026-11-01");
  });

  it("names files by month when the range is a whole month", () => {
    expect(periodSlug("2026-10-01", "2026-10-31")).toBe("2026-10");
    expect(periodSlug("2026-10-01", "2026-10-15")).toBe("2026-10-01_2026-10-15");
    expect(reportQuery({ report: "leave", from: "2026-10-01", emp: [1, 2], page: 1 })).toBe("report=leave&from=2026-10-01&emp=1%2C2");
  });
});
