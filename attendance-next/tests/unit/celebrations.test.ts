import { describe, expect, it } from "vitest";
import { celebrationMessage, occurrenceIn, ordinal, upcomingCelebrations, type CelebrationPerson } from "@/lib/celebrations";
import { announcementSchema, announcementSchemaFor, normalizeBody } from "@/lib/validations/announcements";
import { completedYears, employeeSchema, type EmployeeInput } from "@/lib/validations/employee";
import { addDays, istDate } from "@/lib/time";

const person = (id: number, name: string, dateOfBirth: string | null, joiningDate: string): CelebrationPerson => ({ id, name, photo: null, designation: null, dateOfBirth, joiningDate });

describe("occurrenceIn", () => {
  it("keeps the month and day", () => {
    expect(occurrenceIn("1994-12-03", 2026)).toBe("2026-12-03");
  });
  it("moves Feb 29 to Feb 28 outside leap years", () => {
    expect(occurrenceIn("1996-02-29", 2027)).toBe("2027-02-28");
    expect(occurrenceIn("1996-02-29", 2028)).toBe("2028-02-29");
    expect(occurrenceIn("1996-02-29", 2100)).toBe("2100-02-28");
    expect(occurrenceIn("1996-02-29", 2000)).toBe("2000-02-29");
  });
});

describe("upcomingCelebrations", () => {
  const people = [
    person(1, "Priya Raman", "1995-11-05", "2020-03-01"),
    person(2, "Karthik Selvam", "1996-02-29", "2024-11-07"),
    person(3, "Meena Krishnan", null, "2025-11-19"),
    person(4, "Arun Prakash", "2000-11-20", "2026-11-05"), // joined today: no anniversary yet
  ];

  it("lists birthdays and anniversaries in the window, soonest first", () => {
    const list = upcomingCelebrations(people, "2026-11-05", 14);
    expect(list.map((c) => [c.kind, c.person.id, c.date, c.daysAway, c.years])).toEqual([
      ["BIRTHDAY", 1, "2026-11-05", 0, 31],
      ["ANNIVERSARY", 2, "2026-11-07", 2, 2],
      ["ANNIVERSARY", 3, "2026-11-19", 14, 1],
    ]);
  });

  it("never counts the joining day itself or a future joining as an anniversary", () => {
    const list = upcomingCelebrations([person(5, "New Joiner", null, "2026-11-05"), person(6, "Future Joiner", null, "2026-11-10")], "2026-11-05", 30);
    expect(list).toEqual([]);
  });

  it("is inclusive of the last day and excludes the day after", () => {
    expect(upcomingCelebrations(people, "2026-11-05", 13).map((c) => c.person.id)).not.toContain(3);
  });

  it("days = 0 gives only today's", () => {
    const list = upcomingCelebrations(people, "2026-11-05", 0);
    expect(list).toHaveLength(1);
    expect(list[0]!.person.name).toBe("Priya Raman");
  });

  it("wraps into the next year", () => {
    const list = upcomingCelebrations([person(1, "A", "1990-01-02", "2025-12-30"), person(2, "B", "1990-12-31", "2020-06-01")], "2026-12-28", 14);
    expect(list.map((c) => [c.kind, c.date, c.daysAway, c.years])).toEqual([
      ["ANNIVERSARY", "2026-12-30", 2, 1],
      ["BIRTHDAY", "2026-12-31", 3, 36],
      ["BIRTHDAY", "2027-01-02", 5, 37],
    ]);
  });

  it("celebrates a Feb 29 birthday on Feb 28 in non-leap years and Feb 29 in leap years", () => {
    const leapling = [person(1, "Leap", "1996-02-29", "2020-06-01")];
    expect(upcomingCelebrations(leapling, "2027-02-28", 0).map((c) => [c.date, c.years])).toEqual([["2027-02-28", 31]]);
    expect(upcomingCelebrations(leapling, "2027-03-01", 0)).toEqual([]);
    expect(upcomingCelebrations(leapling, "2028-02-28", 0)).toEqual([]);
    expect(upcomingCelebrations(leapling, "2028-02-29", 0).map((c) => c.date)).toEqual(["2028-02-29"]);
    // Across the wrap: looking from late December into a non-leap February.
    expect(upcomingCelebrations(leapling, "2026-12-20", 70).map((c) => c.date)).toEqual(["2027-02-28"]);
  });

  it("puts birthdays before anniversaries on the same day, then sorts by name", () => {
    const list = upcomingCelebrations([person(1, "Zara", null, "2020-11-06"), person(2, "Bala", "1990-11-06", "2019-11-06"), person(3, "Anu", null, "2021-11-06")], "2026-11-05", 3);
    expect(list.map((c) => `${c.kind}:${c.person.name}`)).toEqual(["BIRTHDAY:Bala", "ANNIVERSARY:Anu", "ANNIVERSARY:Bala", "ANNIVERSARY:Zara"]);
  });
});

describe("celebration messages", () => {
  it("formats ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });

  it("names up to two people in the title, then counts", () => {
    const today = upcomingCelebrations([person(1, "Priya Raman", "1995-11-05", "2020-03-01"), person(2, "Karthik Selvam", null, "2023-11-05")], "2026-11-05", 0);
    expect(celebrationMessage(today)).toEqual({
      title: "Today: Priya's birthday 🎂 · Karthik's 3rd work anniversary",
      body: "Wish Priya Raman a happy birthday! Karthik Selvam completes 3 years with us.",
    });
    const many = upcomingCelebrations([person(1, "A", "1995-11-05", "2026-01-01"), person(2, "B", "1995-11-05", "2026-01-01"), person(3, "C", "1995-11-05", "2026-01-01")], "2026-11-05", 0);
    expect(celebrationMessage(many)!.title).toBe("Today: 3 celebrations 🎉");
    expect(celebrationMessage([])).toBeNull();
  });
});

describe("date of birth on the employee form", () => {
  const base: EmployeeInput = {
    fullName: "Test Person",
    phone: "",
    email: "",
    dateOfBirth: "",
    department: "",
    designation: "",
    joiningDate: "2026-01-01",
    exitDate: "",
    status: "ACTIVE",
    managerId: null,
    shiftId: 1,
    shiftEffectiveFrom: "",
    login: { enabled: false, accessRoleId: null },
  };
  const today = istDate();
  const yearsAgo = (n: number, days = 0) => addDays(`${Number(today.slice(0, 4)) - n}${today.slice(4)}`, days);
  const error = (dateOfBirth: string) => {
    const r = employeeSchema.safeParse({ ...base, dateOfBirth });
    return r.success ? null : r.error.issues.find((i) => i.path[0] === "dateOfBirth")?.message ?? null;
  };

  it("is optional", () => {
    const { dateOfBirth: _omit, ...rest } = base;
    void _omit;
    expect(employeeSchema.safeParse(rest).success).toBe(true);
    expect(error("")).toBeNull();
  });

  it("accepts ages 14 to 100", () => {
    expect(error("1992-03-18")).toBeNull();
    expect(error(yearsAgo(14))).toBeNull();
    expect(error(yearsAgo(101, 1))).toBeNull();
  });

  it("rejects future dates, under-14s and over-100s", () => {
    expect(error(addDays(today, 1))).toMatch(/past/);
    expect(error(today)).toMatch(/past/);
    expect(error(yearsAgo(14, 1))).toMatch(/at least 14/);
    expect(error(yearsAgo(101))).toMatch(/over 100/);
  });

  it("counts completed years", () => {
    expect(completedYears("1996-02-29", "2027-02-28")).toBe(30);
    expect(completedYears("1996-02-29", "2027-03-01")).toBe(31);
    expect(completedYears("1990-11-05", "2026-11-05")).toBe(36);
    expect(completedYears("1990-11-06", "2026-11-05")).toBe(35);
  });
});

describe("announcement form", () => {
  const valid = { title: "Office closed Saturday", body: "Line one\r\n\r\n\r\n\r\nLine two   ", pinned: false, expiresOn: "", notify: true };

  it("keeps line breaks but folds CRLF, trailing spaces and long blank runs", () => {
    expect(normalizeBody("a  \r\nb\r\n\r\n\r\n\r\nc\n")).toBe("a\nb\n\nc");
    const r = announcementSchema.safeParse(valid);
    expect(r.success && r.data.body).toBe("Line one\n\nLine two");
  });

  it("requires a title and a message", () => {
    expect(announcementSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...valid, body: " \n \n" }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...valid, body: "x".repeat(2001) }).success).toBe(false);
  });

  it("allows today or later as the last day, and an unchanged past day while editing", () => {
    const today = istDate();
    expect(announcementSchema.safeParse({ ...valid, expiresOn: today }).success).toBe(true);
    expect(announcementSchema.safeParse({ ...valid, expiresOn: addDays(today, -1) }).success).toBe(false);
    expect(announcementSchemaFor(addDays(today, -1)).safeParse({ ...valid, expiresOn: addDays(today, -1) }).success).toBe(true);
    expect(announcementSchemaFor(addDays(today, -1)).safeParse({ ...valid, expiresOn: addDays(today, -2) }).success).toBe(false);
  });
});
