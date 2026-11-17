import type { AttendanceStatus, HalfDaySession } from "@prisma/client";

/**
 * Everything computeDayStatus() needs about one employee on one IST calendar day.
 * Times are minutes since IST midnight of that day (a punch-out after midnight is > 1440).
 */
export interface DayInput {
  date: string;
  joiningDate: string;
  exitDate: string | null;
  holiday: string | null;
  weeklyOff: boolean;
  /** Shift timing for this weekday; null when the shift has no timing for it. */
  timing: { start: number; end: number; fullDayMinutes: number } | null;
  rules: { graceMinutes: number; halfDayMinutes: number; earlyLeaveMinutes: number; overtimeAfterMinutes: number };
  punchIn: number | null;
  punchOut: number | null;
  /** Approved requests covering this day */
  approved: {
    leave: null | "FULL" | HalfDaySession;
    wfh: boolean;
    onDuty: boolean;
    /** Permission window in minutes since midnight */
    permission: { start: number; end: number } | null;
  };
  /** HR/admin override; wins over everything except employment dates. */
  override: AttendanceStatus | null;
  /** True once the day is over (after IST midnight); open punches then become MISSING_PUNCH_OUT. */
  dayOver: boolean;
  /** For a day in progress: minutes since midnight now, used for "hours so far". */
  nowMinutes?: number;
}

export type DayFlag =
  | "WORKED_ON_OFF_DAY"
  | "LATE"
  | "EARLY_LEAVE"
  | "IN_PROGRESS"
  | "HALF_DAY_LEAVE"
  | "PERMISSION_USED";

export interface DayResult {
  /** null = nothing to say yet (today, not punched in, no approved request). */
  status: AttendanceStatus | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  flags: DayFlag[];
}

const EMPTY = { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };

/**
 * The single source of truth for a day's attendance status. Pure: no I/O, no clock.
 *
 * Order of rules:
 * 1. Outside employment dates -> NOT_JOINED / EXITED (never absent or leave).
 * 2. HR override -> that status (times still measured).
 * 3. Approved full-day leave -> LEAVE.
 * 4. No punch: holiday -> HOLIDAY, weekly off -> WEEKLY_OFF, WFH -> WFH, on duty -> ON_DUTY,
 *    day not over -> null, otherwise ABSENT (a half-day leave with no punch -> LEAVE + HALF_DAY_LEAVE).
 * 5. Punched in but not out: day over -> MISSING_PUNCH_OUT; otherwise provisional PRESENT/LATE.
 * 6. Both punches: late = in after start + grace (late minutes counted from start);
 *    worked < half-day minimum -> ABSENT, < full-day minimum -> HALF_DAY, late -> LATE, else PRESENT.
 *    WFH / on-duty approvals report as WFH / ON_DUTY; an approved permission that covers the
 *    late arrival or early leaving reports PERMISSION. Work on a holiday/weekly off is all overtime.
 */
export function computeDayStatus(input: DayInput): DayResult {
  const { date, approved } = input;

  if (date < input.joiningDate) return { status: "NOT_JOINED", ...EMPTY, flags: [] };
  if (input.exitDate && date > input.exitDate) return { status: "EXITED", ...EMPTY, flags: [] };

  const measured = measure(input);
  if (input.override) return { ...measured, status: input.override };

  if (approved.leave === "FULL") return { status: "LEAVE", ...EMPTY, flags: [] };

  const offDay = input.holiday !== null || input.weeklyOff;

  if (input.punchIn === null) {
    if (input.holiday !== null) return { status: "HOLIDAY", ...EMPTY, flags: [] };
    if (input.weeklyOff) return { status: "WEEKLY_OFF", ...EMPTY, flags: [] };
    if (approved.wfh) return { status: "WFH", ...EMPTY, flags: [] };
    if (approved.onDuty) return { status: "ON_DUTY", ...EMPTY, flags: [] };
    if (!input.dayOver) return { status: null, ...EMPTY, flags: [] };
    if (approved.leave) return { status: "LEAVE", ...EMPTY, flags: ["HALF_DAY_LEAVE"] };
    return { status: "ABSENT", ...EMPTY, flags: [] };
  }

  if (input.punchOut === null) {
    if (input.dayOver) return { ...measured, status: "MISSING_PUNCH_OUT" };
    if (offDay) return { ...measured, status: "PRESENT" };
    return { ...measured, status: approved.wfh ? "WFH" : measured.lateMinutes ? "LATE" : "PRESENT" };
  }

  if (offDay) return { ...measured, status: "PRESENT" };
  if (approved.wfh) return { ...measured, status: "WFH" };
  if (approved.onDuty) return { ...measured, status: "ON_DUTY" };

  const timing = input.timing;
  const fullDay = timing?.fullDayMinutes ?? Infinity;
  const worked = measured.workedMinutes;

  if (approved.leave) {
    // Half-day leave: a half day's work completes the day.
    return { ...measured, status: worked >= input.rules.halfDayMinutes ? "HALF_DAY" : "LEAVE" };
  }
  if (measured.flags.includes("PERMISSION_USED")) return { ...measured, status: "PERMISSION" };
  if (worked < input.rules.halfDayMinutes) return { ...measured, status: "ABSENT" };
  if (worked < fullDay) return { ...measured, status: "HALF_DAY" };
  if (measured.lateMinutes) return { ...measured, status: "LATE" };
  return { ...measured, status: "PRESENT" };
}

/** Worked / late / early / overtime minutes and flags, independent of the final status. */
function measure(input: DayInput): Omit<DayResult, "status"> {
  const { punchIn, punchOut, timing, rules, approved } = input;
  const flags: DayFlag[] = [];
  if (punchIn === null) return { ...EMPTY, flags };

  const end = punchOut ?? (input.dayOver ? null : (input.nowMinutes ?? null));
  if (punchOut === null && !input.dayOver) flags.push("IN_PROGRESS");
  const workedMinutes = end !== null ? Math.max(0, end - punchIn) : 0;

  const offDay = input.holiday !== null || input.weeklyOff;
  if (offDay) {
    flags.push("WORKED_ON_OFF_DAY");
    return { workedMinutes, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: punchOut !== null ? workedMinutes : 0, flags };
  }
  if (!timing || approved.wfh || approved.onDuty) {
    return { workedMinutes, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, flags };
  }

  const permission = approved.permission;
  const halfFirst = approved.leave === "FIRST";
  const halfSecond = approved.leave === "SECOND";
  if (approved.leave && approved.leave !== "FULL") flags.push("HALF_DAY_LEAVE");

  // Late: after start + grace. A first-half leave or a permission starting at/before start excuses it.
  let lateMinutes = punchIn > timing.start + rules.graceMinutes ? punchIn - timing.start : 0;
  if (lateMinutes && (halfFirst || (permission && permission.start <= timing.start + rules.graceMinutes && permission.end >= punchIn))) {
    if (permission && !halfFirst) flags.push("PERMISSION_USED");
    lateMinutes = 0;
  }
  if (lateMinutes) flags.push("LATE");

  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  if (punchOut !== null) {
    const early = timing.end - punchOut;
    if (early > rules.earlyLeaveMinutes && !halfSecond) {
      if (permission && permission.start <= punchOut && permission.end >= timing.end - rules.earlyLeaveMinutes) {
        if (!flags.includes("PERMISSION_USED")) flags.push("PERMISSION_USED");
      } else {
        earlyLeaveMinutes = early;
        flags.push("EARLY_LEAVE");
      }
    }
    // Overtime is the time worked beyond shift end + threshold.
    overtimeMinutes = Math.max(0, punchOut - (timing.end + rules.overtimeAfterMinutes));
  }

  return { workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, flags };
}
