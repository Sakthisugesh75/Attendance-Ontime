import { describe, expect, it } from "vitest";
import { isWeeklyOff, SATURDAY_POLICIES } from "@/lib/attendance/weekly-off";
import {
  availableBalance,
  checkLeaveBalance,
  checkPermission,
  checkRegularization,
  clashes,
  countWorkingDays,
  findClash,
  fmtDays,
  normalizeRequest,
  regularizedPunches,
  requestSchema,
  sniffAttachment,
  spanDays,
  wfhOverCap,
  type RequestInput,
} from "@/lib/validations/requests";

// Seed calendar: Sunday + 2nd/4th Saturday off, Deepavali on Sun 08 Nov and Christmas on Fri 25 Dec 2026.
const rules = [{ shiftId: null, effectiveFrom: "2026-01-01", pattern: SATURDAY_POLICIES.ALT_2_4.pattern }];
const holidays = new Set(["2026-11-08", "2026-12-25"]);
const isOff = (d: string) => holidays.has(d) || isWeeklyOff(rules, d, null);

const base: RequestInput = { type: "LEAVE", leaveTypeId: 1, fromDate: "2026-11-10", toDate: "2026-11-11", halfDay: "NONE", startTime: "", endTime: "", reason: "Family function" };

describe("working-day counting", () => {
  it("counts Mon–Fri and skips Sundays and 2nd/4th Saturdays", () => {
    // Mon 09 Nov – Sun 15 Nov: Sat 14 Nov is the 2nd Saturday, Sun 15 is off.
    expect(countWorkingDays("2026-11-09", "2026-11-15", isOff)).toBe(5);
    // Sat 07 Nov is the 1st Saturday (working); Sun 08 is Deepavali + Sunday.
    expect(countWorkingDays("2026-11-07", "2026-11-08", isOff)).toBe(1);
  });
  it("skips holidays on working weekdays", () => {
    // Thu 24 counts; Fri 25 is Christmas; Sat 26 is the 4th Saturday.
    expect(countWorkingDays("2026-12-24", "2026-12-26", isOff)).toBe(1);
    // Wed 23 – Thu 31 Dec: 23, 24, 28, 29, 30, 31.
    expect(countWorkingDays("2026-12-23", "2026-12-31", isOff)).toBe(6);
  });
  it("counts a half day as 0.5, and nothing on an off day", () => {
    expect(countWorkingDays("2026-11-10", "2026-11-10", isOff, "FIRST")).toBe(0.5);
    expect(countWorkingDays("2026-11-15", "2026-11-15", isOff, "SECOND")).toBe(0);
  });
  it("returns 0 for an inverted range", () => {
    expect(countWorkingDays("2026-11-11", "2026-11-10", isOff)).toBe(0);
  });
  it("spans calendar days inclusively", () => {
    expect(spanDays("2026-11-30", "2026-12-01")).toBe(2);
  });
});

describe("balance maths", () => {
  it("available = allotted + carried forward − used − pending", () => {
    expect(availableBalance({ allotted: 15, carriedForward: 4, used: 3, pending: 1.5 })).toBe(14.5);
  });
  it("blocks paid leave beyond the balance, never unpaid leave", () => {
    expect(checkLeaveBalance(2, 2, true)).toBeNull();
    expect(checkLeaveBalance(2.5, 2, true)).toMatch(/Only 2 days available/);
    expect(checkLeaveBalance(1, 0, true)).toMatch(/No balance left/);
    expect(checkLeaveBalance(30, 0, false)).toBeNull();
  });
  it("formats day counts", () => {
    expect(fmtDays(1)).toBe("1 day");
    expect(fmtDays(2.5)).toBe("2.5 days");
  });
});

describe("caps", () => {
  const caps = { permissionPerMonth: 2, permissionMaxMinutes: 120 };
  it("allows a permission within the length and monthly count", () => {
    expect(checkPermission("09:30", "11:30", 1, caps)).toBeNull();
  });
  it("blocks a permission that is too long", () => {
    expect(checkPermission("09:30", "11:31", 0, caps)).toMatch(/at most 2h/);
  });
  it("blocks a permission past the monthly count", () => {
    expect(checkPermission("16:30", "17:30", 2, caps)).toMatch(/monthly limit/);
  });
  it("reports WFH months that go past the cap (a warning, not a block)", () => {
    expect(wfhOverCap(["2026-11-10", "2026-11-11"], { "2026-11": 2 }, 4)).toEqual([]);
    expect(wfhOverCap(["2026-11-10", "2026-11-11", "2026-12-01"], { "2026-11": 3 }, 4)).toEqual([{ month: "2026-11", total: 5 }]);
  });
});

describe("clashes", () => {
  const leave = { type: "LEAVE" as const, fromDate: "2026-11-10", toDate: "2026-11-12", halfDay: null };
  it("ignores requests on other dates", () => {
    expect(clashes(leave, { type: "LEAVE", fromDate: "2026-11-13", toDate: "2026-11-13", halfDay: null })).toBe(false);
  });
  it("full-day leave clashes with WFH, on duty, permission and leave", () => {
    for (const type of ["LEAVE", "WFH", "ON_DUTY", "PERMISSION"] as const) {
      expect(clashes(leave, { type, fromDate: "2026-11-12", toDate: "2026-11-12", halfDay: null })).toBe(true);
    }
  });
  it("lets the other half of a half-day leave through, but not the same half", () => {
    const first = { type: "LEAVE" as const, fromDate: "2026-11-10", toDate: "2026-11-10", halfDay: "FIRST" as const };
    expect(clashes(first, { ...first, halfDay: "SECOND" })).toBe(false);
    expect(clashes(first, { ...first })).toBe(true);
    expect(clashes(first, { type: "PERMISSION", fromDate: "2026-11-10", toDate: "2026-11-10", halfDay: null })).toBe(false);
  });
  it("WFH and on duty clash; one permission per day; regularization only with regularization", () => {
    const day = { fromDate: "2026-11-10", toDate: "2026-11-10", halfDay: null };
    expect(clashes({ type: "WFH", ...day }, { type: "ON_DUTY", ...day })).toBe(true);
    expect(clashes({ type: "WFH", ...day }, { type: "PERMISSION", ...day })).toBe(false);
    expect(clashes({ type: "PERMISSION", ...day }, { type: "PERMISSION", ...day })).toBe(true);
    expect(clashes({ type: "REGULARIZATION", ...day }, { type: "LEAVE", ...day })).toBe(false);
    expect(clashes({ type: "REGULARIZATION", ...day }, { type: "REGULARIZATION", ...day })).toBe(true);
  });
  it("only active requests count", () => {
    const day = { fromDate: "2026-11-10", toDate: "2026-11-10", halfDay: null };
    const existing = [
      { id: 1, type: "WFH" as const, status: "REJECTED" as const, ...day },
      { id: 2, type: "WFH" as const, status: "CANCELLED" as const, ...day },
    ];
    expect(findClash({ type: "WFH", ...day }, existing)).toBeNull();
    expect(findClash({ type: "WFH", ...day }, [...existing, { id: 3, type: "WFH" as const, status: "CANCEL_REQUESTED" as const, ...day }])?.id).toBe(3);
  });
});

describe("request schema", () => {
  it("accepts a valid leave and normalises it", () => {
    const v = requestSchema.parse(base);
    expect(normalizeRequest(v)).toMatchObject({ type: "LEAVE", leaveTypeId: 1, fromDate: "2026-11-10", toDate: "2026-11-11", halfDay: null, startTime: null });
  });
  it("rejects a half day over several dates", () => {
    const r = requestSchema.safeParse({ ...base, halfDay: "FIRST" });
    expect(r.success).toBe(false);
  });
  it("keeps the half for a single date", () => {
    expect(normalizeRequest(requestSchema.parse({ ...base, toDate: "2026-11-10", halfDay: "SECOND" })).halfDay).toBe("SECOND");
  });
  it("needs both permission times, end after start", () => {
    expect(requestSchema.safeParse({ ...base, type: "PERMISSION", startTime: "10:00", endTime: "" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, type: "PERMISSION", startTime: "10:00", endTime: "09:00" }).success).toBe(false);
    const ok = normalizeRequest(requestSchema.parse({ ...base, type: "PERMISSION", startTime: "16:30", endTime: "18:00" }));
    expect(ok).toMatchObject({ toDate: "2026-11-10", leaveTypeId: null, startTime: "16:30", endTime: "18:00" });
  });
  it("drops leave-only fields from other types", () => {
    const n = normalizeRequest(requestSchema.parse({ ...base, type: "WFH", halfDay: "NONE" }));
    expect(n).toMatchObject({ leaveTypeId: null, halfDay: null, startTime: null });
  });
  it("needs at least one regularization time", () => {
    expect(requestSchema.safeParse({ ...base, type: "REGULARIZATION" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...base, type: "REGULARIZATION", endTime: "18:40" }).success).toBe(true);
  });
  it("requires a reason", () => {
    expect(requestSchema.safeParse({ ...base, reason: "  " }).success).toBe(false);
  });
});

describe("regularization", () => {
  const record = { punchInAt: new Date("2026-11-03T04:05:00Z"), punchOutAt: null };
  it("keeps the recorded punch-in and fills the punch-out in IST", () => {
    const p = regularizedPunches(record, { fromDate: "2026-11-03", startTime: null, endTime: "18:40" });
    expect(p.punchInAt).toEqual(record.punchInAt);
    expect(p.punchOutAt?.toISOString()).toBe("2026-11-03T13:10:00.000Z");
  });
  it("needs a punch-in when the day has none", () => {
    expect(checkRegularization(null, { fromDate: "2026-11-03", startTime: null, endTime: "18:40" })).toMatch(/Add the punch-in/);
    expect(checkRegularization(null, { fromDate: "2026-11-03", startTime: "09:30", endTime: "18:40" })).toBeNull();
  });
  it("rejects a punch-out before the punch-in", () => {
    expect(checkRegularization(record, { fromDate: "2026-11-03", startTime: null, endTime: "09:00" })).toMatch(/after punch-in/);
  });
});

describe("attachments", () => {
  it("recognises PDF, JPG and PNG by content", () => {
    expect(sniffAttachment(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("pdf");
    expect(sniffAttachment(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffAttachment(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniffAttachment(new TextEncoder().encode("<html>"))).toBeNull();
  });
});
