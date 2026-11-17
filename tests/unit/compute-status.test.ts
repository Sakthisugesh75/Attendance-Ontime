import { describe, expect, it } from "vitest";
import { computeDayStatus, type DayInput } from "@/lib/attendance/compute-status";

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** A normal weekday: shift 09:30–18:30, 15 min grace, 8 h full day, 4 h half day. */
function day(over: Partial<DayInput> = {}): DayInput {
  return {
    date: "2026-11-04",
    joiningDate: "2026-01-01",
    exitDate: null,
    holiday: null,
    weeklyOff: false,
    timing: { start: t("09:30"), end: t("18:30"), fullDayMinutes: 480 },
    rules: { graceMinutes: 15, halfDayMinutes: 240, earlyLeaveMinutes: 15, overtimeAfterMinutes: 30 },
    punchIn: null,
    punchOut: null,
    approved: { leave: null, wfh: false, onDuty: false, permission: null },
    override: null,
    dayOver: true,
    ...over,
  };
}
const approved = (a: Partial<DayInput["approved"]>) => ({ leave: null, wfh: false, onDuty: false, permission: null, ...a });

describe("employment dates", () => {
  it("is NOT_JOINED before the joining date, even with punches", () => {
    expect(computeDayStatus(day({ joiningDate: "2026-11-05", punchIn: t("09:30"), punchOut: t("18:30") })).status).toBe("NOT_JOINED");
  });
  it("is EXITED after the exit date and never ABSENT", () => {
    expect(computeDayStatus(day({ exitDate: "2026-11-03" })).status).toBe("EXITED");
  });
  it("counts the joining and exit dates themselves", () => {
    expect(computeDayStatus(day({ joiningDate: "2026-11-04", exitDate: "2026-11-04" })).status).toBe("ABSENT");
  });
});

describe("no punches", () => {
  it("is ABSENT on a finished working day", () => {
    expect(computeDayStatus(day()).status).toBe("ABSENT");
  });
  it("is null (nothing yet) on a day still in progress", () => {
    expect(computeDayStatus(day({ dayOver: false })).status).toBeNull();
  });
  it("is HOLIDAY on a holiday", () => {
    expect(computeDayStatus(day({ holiday: "Deepavali" })).status).toBe("HOLIDAY");
  });
  it("is WEEKLY_OFF on a weekly off", () => {
    expect(computeDayStatus(day({ weeklyOff: true })).status).toBe("WEEKLY_OFF");
  });
  it("prefers HOLIDAY when a holiday falls on a weekly off", () => {
    expect(computeDayStatus(day({ holiday: "Deepavali", weeklyOff: true })).status).toBe("HOLIDAY");
  });
  it("is LEAVE with an approved full-day leave", () => {
    expect(computeDayStatus(day({ approved: approved({ leave: "FULL" }) })).status).toBe("LEAVE");
  });
  it("is WFH / ON_DUTY with an approval and no punch", () => {
    expect(computeDayStatus(day({ approved: approved({ wfh: true }) })).status).toBe("WFH");
    expect(computeDayStatus(day({ approved: approved({ onDuty: true }) })).status).toBe("ON_DUTY");
  });
  it("is LEAVE (half) when a half-day leave is not followed by any work", () => {
    const r = computeDayStatus(day({ approved: approved({ leave: "FIRST" }) }));
    expect(r.status).toBe("LEAVE");
    expect(r.flags).toContain("HALF_DAY_LEAVE");
  });
});

describe("punctuality", () => {
  it("is PRESENT inside the grace period", () => {
    const r = computeDayStatus(day({ punchIn: t("09:45"), punchOut: t("18:30") }));
    expect(r.status).toBe("PRESENT");
    expect(r.lateMinutes).toBe(0);
  });
  it("is LATE one minute after grace, counting late minutes from shift start", () => {
    const r = computeDayStatus(day({ punchIn: t("09:46"), punchOut: t("18:30") }));
    expect(r.status).toBe("LATE");
    expect(r.lateMinutes).toBe(16);
  });
  it("is HALF_DAY when worked time is between the half-day and full-day minimum", () => {
    const r = computeDayStatus(day({ punchIn: t("09:30"), punchOut: t("14:30") }));
    expect(r.status).toBe("HALF_DAY");
    expect(r.workedMinutes).toBe(300);
  });
  it("is ABSENT when worked time is under the half-day minimum", () => {
    expect(computeDayStatus(day({ punchIn: t("09:30"), punchOut: t("12:00") })).status).toBe("ABSENT");
  });
  it("records early leaving beyond the threshold", () => {
    const r = computeDayStatus(day({ punchIn: t("09:00"), punchOut: t("18:00") }));
    expect(r.status).toBe("PRESENT");
    expect(r.earlyLeaveMinutes).toBe(30);
    expect(r.flags).toContain("EARLY_LEAVE");
  });
  it("ignores leaving within the early-leave threshold", () => {
    expect(computeDayStatus(day({ punchIn: t("09:20"), punchOut: t("18:20") })).earlyLeaveMinutes).toBe(0);
  });
  it("counts overtime beyond shift end + 30 minutes", () => {
    expect(computeDayStatus(day({ punchIn: t("09:30"), punchOut: t("19:00") })).overtimeMinutes).toBe(0);
    expect(computeDayStatus(day({ punchIn: t("09:30"), punchOut: t("19:45") })).overtimeMinutes).toBe(45);
  });
  it("handles a punch-out after midnight", () => {
    const r = computeDayStatus(day({ punchIn: t("09:30"), punchOut: 1440 + 30 }));
    expect(r.workedMinutes).toBe(15 * 60);
    expect(r.overtimeMinutes).toBe(1440 + 30 - (t("18:30") + 30));
  });
  it("uses the weekday's own full-day minimum (shorter Saturday)", () => {
    const sat = day({ timing: { start: t("09:30"), end: t("17:30"), fullDayMinutes: 420 }, punchIn: t("09:30"), punchOut: t("17:00") });
    expect(computeDayStatus(sat).status).toBe("PRESENT");
  });
});

describe("open punches", () => {
  it("is MISSING_PUNCH_OUT once the day is over", () => {
    const r = computeDayStatus(day({ punchIn: t("09:30") }));
    expect(r.status).toBe("MISSING_PUNCH_OUT");
    expect(r.workedMinutes).toBe(0);
  });
  it("is provisional PRESENT / LATE while the day is in progress, with hours so far", () => {
    const onTime = computeDayStatus(day({ dayOver: false, punchIn: t("09:35"), nowMinutes: t("12:35") }));
    expect(onTime.status).toBe("PRESENT");
    expect(onTime.workedMinutes).toBe(180);
    expect(onTime.flags).toContain("IN_PROGRESS");
    expect(computeDayStatus(day({ dayOver: false, punchIn: t("10:00"), nowMinutes: t("11:00") })).status).toBe("LATE");
  });
});

describe("approvals", () => {
  it("reports WFH when punched with an approved WFH, without lateness", () => {
    const r = computeDayStatus(day({ punchIn: t("10:30"), punchOut: t("18:30"), approved: approved({ wfh: true }) }));
    expect(r.status).toBe("WFH");
    expect(r.lateMinutes).toBe(0);
  });
  it("reports PERMISSION when a permission covers the late arrival", () => {
    const r = computeDayStatus(day({ punchIn: t("11:00"), punchOut: t("18:30"), approved: approved({ permission: { start: t("09:30"), end: t("11:00") } }) }));
    expect(r.status).toBe("PERMISSION");
    expect(r.lateMinutes).toBe(0);
  });
  it("reports PERMISSION when a permission covers leaving early", () => {
    const r = computeDayStatus(day({ punchIn: t("09:30"), punchOut: t("16:30"), approved: approved({ permission: { start: t("16:30"), end: t("18:30") } }) }));
    expect(r.status).toBe("PERMISSION");
    expect(r.earlyLeaveMinutes).toBe(0);
  });
  it("still marks LATE when the permission doesn't cover the arrival", () => {
    const r = computeDayStatus(day({ punchIn: t("11:00"), punchOut: t("18:30"), approved: approved({ permission: { start: t("15:00"), end: t("16:00") } }) }));
    expect(r.lateMinutes).toBe(90);
  });
  it("makes a half-day leave plus half a day's work HALF_DAY, not late", () => {
    const r = computeDayStatus(day({ punchIn: t("14:00"), punchOut: t("18:30"), approved: approved({ leave: "FIRST" }) }));
    expect(r.status).toBe("HALF_DAY");
    expect(r.lateMinutes).toBe(0);
  });
});

describe("off days and overrides", () => {
  it("counts all work on a holiday as overtime", () => {
    const r = computeDayStatus(day({ holiday: "Deepavali", punchIn: t("10:00"), punchOut: t("14:00") }));
    expect(r.status).toBe("PRESENT");
    expect(r.overtimeMinutes).toBe(240);
    expect(r.flags).toContain("WORKED_ON_OFF_DAY");
  });
  it("uses an HR override but keeps the measured times", () => {
    const r = computeDayStatus(day({ punchIn: t("10:30"), punchOut: t("18:30"), override: "PRESENT" }));
    expect(r.status).toBe("PRESENT");
    expect(r.lateMinutes).toBe(60);
  });
  it("never lets an override make a pre-joining day count", () => {
    expect(computeDayStatus(day({ joiningDate: "2026-12-01", override: "ABSENT" })).status).toBe("NOT_JOINED");
  });
});
