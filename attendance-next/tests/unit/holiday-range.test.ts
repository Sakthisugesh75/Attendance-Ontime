import { describe, expect, it } from "vitest";
import { holidayDates, MAX_HOLIDAY_SPAN, newHolidaySchema } from "@/lib/validations/holidays";

const base = { date: "2027-01-13", name: "Pongal Break", type: "STATE" as const, isDeclared: false };

describe("holidayDates", () => {
  it("is one day without an end date", () => {
    expect(holidayDates("2027-01-13")).toEqual(["2027-01-13"]);
    expect(holidayDates("2027-01-13", "")).toEqual(["2027-01-13"]);
  });
  it("lists every day inclusive, across months and years", () => {
    expect(holidayDates("2027-01-13", "2027-01-15")).toEqual(["2027-01-13", "2027-01-14", "2027-01-15"]);
    expect(holidayDates("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(holidayDates("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });
  it("never runs away on a huge range", () => {
    expect(holidayDates("2027-01-01", "2030-01-01").length).toBe(MAX_HOLIDAY_SPAN + 1);
  });
});

describe("newHolidaySchema", () => {
  it("accepts one day and a range", () => {
    expect(newHolidaySchema.safeParse({ ...base, toDate: "" }).success).toBe(true);
    expect(newHolidaySchema.safeParse({ ...base, toDate: "2027-01-15" }).success).toBe(true);
  });
  it("refuses an end before the start", () => {
    const r = newHolidaySchema.safeParse({ ...base, toDate: "2027-01-10" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["toDate"]);
  });
  it(`refuses more than ${MAX_HOLIDAY_SPAN} days`, () => {
    expect(newHolidaySchema.safeParse({ ...base, toDate: "2027-02-12" }).success).toBe(true); // 31 days
    expect(newHolidaySchema.safeParse({ ...base, toDate: "2027-02-13" }).success).toBe(false);
  });
});
