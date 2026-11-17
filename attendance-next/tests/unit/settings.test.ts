import { describe, expect, it } from "vitest";
import { isWeeklyOff, SATURDAY_POLICIES } from "@/lib/attendance/weekly-off";
import { holidaySchema } from "@/lib/validations/holidays";
import {
  allocationFor,
  buildPattern,
  describePattern,
  detectPolicy,
  groupShiftDays,
  leaveTypeSchema,
  SATURDAY_POLICY_KEYS,
  settingsTabSchema,
  shiftSchema,
  weeklyOffSchema,
} from "@/lib/validations/settings";

describe("weekly-off presets", () => {
  it("builds the same patterns as SATURDAY_POLICIES when Sunday is off", () => {
    for (const key of SATURDAY_POLICY_KEYS) expect(buildPattern(key, true)).toEqual(SATURDAY_POLICIES[key].pattern);
  });
  it("drops Sunday when Sunday is a working day", () => {
    expect(buildPattern("ALT_1_3", false)).toEqual({ "6": [1, 3] });
    expect(buildPattern("ALL_WORKING", false)).toEqual({});
  });
  it("detects presets back from stored patterns, in any order", () => {
    expect(detectPolicy({ "6": [4, 2], "0": "ALL" })).toEqual({ saturday: "ALT_2_4", sundayOff: true });
    expect(detectPolicy({ "6": "ALL" })).toEqual({ saturday: "ALL_OFF", sundayOff: false });
    expect(detectPolicy({ "0": "ALL" })).toEqual({ saturday: "ALL_WORKING", sundayOff: true });
    expect(detectPolicy({ "0": "ALL", "5": "ALL" })).toBeNull();
    expect(detectPolicy({ "6": [1] })).toBeNull();
  });
  it("describes patterns", () => {
    expect(describePattern(buildPattern("ALT_2_4", true))).toBe("Sunday + 2nd & 4th Saturday off");
    expect(describePattern(buildPattern("ALL_OFF", false))).toBe("all Saturdays off");
    expect(describePattern({})).toBe("No weekly off");
    expect(describePattern({ "5": [1] })).toBe("1st Fri off");
  });
  it("a new rule changes offs only from its effective date", () => {
    const rules = [
      { shiftId: null, effectiveFrom: "2026-01-01", pattern: buildPattern("ALT_2_4", true) },
      { shiftId: null, effectiveFrom: "2026-12-01", pattern: buildPattern("ALL_OFF", true) },
    ];
    expect(isWeeklyOff(rules, "2026-11-07", null)).toBe(false); // 1st Saturday, old rule
    expect(isWeeklyOff(rules, "2026-11-14", null)).toBe(true); // 2nd Saturday, old rule
    expect(isWeeklyOff(rules, "2026-12-05", null)).toBe(true); // 1st Saturday, new rule
  });
  it("validates the weekly-off form", () => {
    expect(weeklyOffSchema.safeParse({ saturday: "ALT_1_3", sundayOff: true, effectiveFrom: "2026-12-01" }).success).toBe(true);
    expect(weeklyOffSchema.safeParse({ saturday: "ALT_1_3", sundayOff: true, effectiveFrom: "" }).success).toBe(false);
    expect(weeklyOffSchema.safeParse({ saturday: "EVERY_OTHER", sundayOff: true, effectiveFrom: "2026-12-01" }).success).toBe(false);
  });
});

describe("leave allocation", () => {
  const el = { yearlyQuota: 15, carryForward: true, maxCarryForward: 30 };
  it("gives the quota and nothing carried without a previous balance", () => {
    expect(allocationFor(el, null)).toEqual({ allotted: 15, carriedForward: 0 });
  });
  it("carries unused days up to the cap", () => {
    expect(allocationFor(el, { allotted: 15, carriedForward: 4, used: 9 })).toEqual({ allotted: 15, carriedForward: 10 });
    expect(allocationFor({ ...el, maxCarryForward: 5 }, { allotted: 15, carriedForward: 4, used: 9 })).toEqual({ allotted: 15, carriedForward: 5 });
  });
  it("never carries a negative balance, and nothing for non-carry types", () => {
    expect(allocationFor(el, { allotted: 15, carriedForward: 0, used: 20 }).carriedForward).toBe(0);
    expect(allocationFor({ yearlyQuota: 12, carryForward: false, maxCarryForward: 10 }, { allotted: 12, carriedForward: 0, used: 2 })).toEqual({ allotted: 12, carriedForward: 0 });
  });
  it("is idempotent: same inputs, same result", () => {
    const prev = { allotted: 15, carriedForward: 4, used: 9 };
    expect(allocationFor(el, prev)).toEqual(allocationFor(el, prev));
  });
  it("normalises leave type input", () => {
    const v = leaveTypeSchema.parse({ code: " cl ", name: "Casual Leave", yearlyQuota: 12, isPaid: true, carryForward: false, maxCarryForward: 9, isActive: true });
    expect(v.code).toBe("CL");
    expect(v.maxCarryForward).toBe(0);
    expect(leaveTypeSchema.safeParse({ code: "CL", name: "Casual", yearlyQuota: 1.3, isPaid: true, carryForward: false, maxCarryForward: 0, isActive: true }).success).toBe(false);
  });
});

describe("shifts", () => {
  const day = (enabled: boolean, startTime = "09:30", endTime = "18:30", fullDayMinutes: number | "" = "") => ({ enabled, startTime, endTime, fullDayMinutes });
  const base = {
    name: "General",
    isDefault: true,
    graceMinutes: 15,
    fullDayMinutes: 480,
    halfDayMinutes: 240,
    earlyLeaveMinutes: 15,
    overtimeAfterMinutes: 30,
    days: [day(false), day(true), day(true), day(true), day(true), day(true), day(true, "09:30", "17:30", 420)],
  };
  it("accepts a Mon–Sat shift with a shorter Saturday", () => {
    const v = shiftSchema.parse(base);
    expect(v.days[6]!.fullDayMinutes).toBe(420);
    expect(v.days[1]!.fullDayMinutes).toBe("");
  });
  it("rejects a day that ends before it starts, and half day ≥ full day", () => {
    const bad = shiftSchema.safeParse({ ...base, days: base.days.map((d, i) => (i === 3 ? day(true, "18:00", "09:00") : d)) });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]!.path).toEqual(["days", 3, "endTime"]);
    expect(shiftSchema.safeParse({ ...base, halfDayMinutes: 480 }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...base, days: base.days.map(() => day(false)) }).success).toBe(false);
  });
  it("groups weekday timings Monday first", () => {
    const groups = groupShiftDays([
      { weekday: 6, startTime: "09:30", endTime: "17:30", fullDayMinutes: 420 },
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:30", endTime: "18:30", fullDayMinutes: null })),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Mon–Fri", "Sat"]);
    expect(groupShiftDays([1, 3].map((weekday) => ({ weekday, startTime: "09:30", endTime: "18:30", fullDayMinutes: null }))).map((g) => g.label)).toEqual(["Mon", "Wed"]);
  });
});

describe("holidays and navigation", () => {
  it("validates holidays", () => {
    expect(holidaySchema.safeParse({ date: "2026-11-08", name: "Deepavali", type: "STATE", isDeclared: false }).success).toBe(true);
    expect(holidaySchema.safeParse({ date: "2026-11-08", name: " ", type: "STATE", isDeclared: false }).success).toBe(false);
    expect(holidaySchema.safeParse({ date: "08/11/2026", name: "Deepavali", type: "STATE", isDeclared: false }).success).toBe(false);
  });
  it("falls back to the company tab for unknown tabs", () => {
    expect(settingsTabSchema.parse("shifts")).toBe("shifts");
    expect(settingsTabSchema.parse("nope")).toBe("company");
    expect(settingsTabSchema.parse(undefined)).toBe("company");
  });
});
