import { describe, expect, it } from "vitest";
import { isWeeklyOff, ruleInForce, SATURDAY_POLICIES, type WeeklyOffPattern } from "@/lib/attendance/weekly-off";
import { distanceMeters } from "@/lib/attendance/geo";
import { formatClock, formatDate, formatTime, istAt, istDate, istMinutes, monthDates } from "@/lib/time";

describe("IST time helpers", () => {
  it("maps UTC instants onto the IST calendar day", () => {
    expect(istDate(new Date("2026-11-03T18:29:00Z"))).toBe("2026-11-03");
    expect(istDate(new Date("2026-11-03T18:30:00Z"))).toBe("2026-11-04");
  });
  it("round-trips HH:mm IST", () => {
    const at = istAt("2026-11-04", "09:45");
    expect(at.toISOString()).toBe("2026-11-04T04:15:00.000Z");
    expect(istMinutes(at, "2026-11-04")).toBe(585);
    expect(formatTime(at)).toBe("09:45 AM");
  });
  it("formats like 09:45 AM and 04 Nov 2026", () => {
    expect(formatClock(18 * 60 + 32)).toBe("06:32 PM");
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatDate("2026-11-04")).toBe("04 Nov 2026");
  });
  it("lists every date of a month", () => {
    expect(monthDates("2026-02")).toHaveLength(28);
    expect(monthDates("2026-11").at(-1)).toBe("2026-11-30");
  });
});

describe("weekly offs", () => {
  const rules = [{ shiftId: null, effectiveFrom: "2026-01-01", pattern: SATURDAY_POLICIES.ALT_2_4.pattern }];
  it("applies Sundays and 2nd/4th Saturdays", () => {
    expect(isWeeklyOff(rules, "2026-11-01", null)).toBe(true); // Sunday
    expect(isWeeklyOff(rules, "2026-11-07", null)).toBe(false); // 1st Saturday
    expect(isWeeklyOff(rules, "2026-11-14", null)).toBe(true); // 2nd Saturday
    expect(isWeeklyOff(rules, "2026-11-28", null)).toBe(true); // 4th Saturday
    expect(isWeeklyOff(rules, "2026-11-04", null)).toBe(false); // Wednesday
  });
  it("keeps history: a later rule applies only from its date", () => {
    const history = [...rules, { shiftId: null, effectiveFrom: "2026-12-01", pattern: SATURDAY_POLICIES.ALL_OFF.pattern }];
    expect(isWeeklyOff(history, "2026-11-07", null)).toBe(false);
    expect(isWeeklyOff(history, "2026-12-05", null)).toBe(true);
  });
  it("honours custom off and working dates", () => {
    const custom = [{ ...rules[0]!, customOffDates: ["2026-11-07"], customWorkDates: ["2026-11-14"] }];
    expect(isWeeklyOff(custom, "2026-11-07", null)).toBe(true);
    expect(isWeeklyOff(custom, "2026-11-14", null)).toBe(false);
  });
  it("lets a shift-specific rule beat the company rule", () => {
    const withShift = [...rules, { shiftId: 2, effectiveFrom: "2026-01-01", pattern: SATURDAY_POLICIES.ALL_WORKING.pattern }];
    expect(isWeeklyOff(withShift, "2026-11-14", 2)).toBe(false);
    expect(isWeeklyOff(withShift, "2026-11-14", 1)).toBe(true);
  });
});

describe("geofence distance", () => {
  it("measures metres between two points", () => {
    const d = distanceMeters({ lat: 11.0168, lng: 76.9558 }, { lat: 11.0177, lng: 76.9558 });
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
});

describe("weekly offs by department and designation", () => {
  const company = { shiftId: null, effectiveFrom: "2026-01-01", pattern: { "0": "ALL", "6": [2, 4] } as WeeklyOffPattern };
  const sales = { shiftId: null, departmentId: 7, effectiveFrom: "2026-12-01", pattern: { "0": "ALL" } as WeeklyOffPattern };
  const devs = { shiftId: null, designationId: 3, effectiveFrom: "2026-12-01", pattern: { "0": "ALL", "6": "ALL" } as WeeklyOffPattern };
  const rules = [company, sales, devs];
  // 12 Dec 2026 is the 2nd Saturday, 19 Dec the 3rd.
  it("a group rule applies only from its start date", () => {
    expect(isWeeklyOff(rules, "2026-11-28", { shiftId: null, departmentId: 7 })).toBe(true); // 4th Sat, company rule still
    expect(isWeeklyOff(rules, "2026-12-12", { shiftId: null, departmentId: 7 })).toBe(false); // Sales works every Saturday
  });
  it("designation beats department beats company", () => {
    expect(isWeeklyOff(rules, "2026-12-19", { shiftId: null, departmentId: 7, designationId: 3 })).toBe(true);
    expect(isWeeklyOff(rules, "2026-12-19", { shiftId: null })).toBe(false);
    expect(isWeeklyOff(rules, "2026-12-12", { shiftId: null })).toBe(true);
  });
  it("company lookups ignore group rules", () => {
    expect(ruleInForce(rules, "2026-12-12", null)).toBe(company);
  });
  it("an inherit rule hands the group back to the next level", () => {
    const back = { shiftId: null, departmentId: 7, inherit: true, effectiveFrom: "2027-01-01", pattern: {} as WeeklyOffPattern };
    expect(ruleInForce([...rules, back], "2027-01-09", { shiftId: null, departmentId: 7 })).toBe(company);
  });
});
