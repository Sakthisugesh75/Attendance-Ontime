import { describe, expect, it } from "vitest";
import {
  blankTask,
  checkReportContent,
  keepSections,
  checkReportDate,
  fillableDates,
  fmtHours,
  isBlocked,
  MAX_BACK_DAYS,
  pageParams,
  parseTasks,
  reportSchema,
  reviewSchema,
  totalHours,
  type ReportInput,
} from "@/lib/validations/daily-reports";
import { DEFAULT_SECTIONS } from "@/lib/validations/report-forms";

const base: ReportInput = {
  date: "2026-11-05",
  tasks: [
    { title: "Edited the promo video", hours: 3.5, status: "DONE" },
    { title: "Colour grading", hours: 2, status: "IN_PROGRESS" },
  ],
  summary: "",
  tomorrowPlan: "Finish grading",
  blockers: "",
};

describe("reportSchema", () => {
  it("accepts a normal report and trims text", () => {
    const r = reportSchema.safeParse({ ...base, summary: "  Good day  " });
    expect(r.success).toBe(true);
    expect(r.data!.summary).toBe("Good day");
    expect(r.data!.tasks).toHaveLength(2);
  });

  it("drops completely blank task rows", () => {
    const r = reportSchema.safeParse({ ...base, tasks: [...base.tasks, blankTask(), { title: "   ", hours: null, status: "BLOCKED" }] });
    expect(r.success).toBe(true);
    expect(r.data!.tasks).toHaveLength(2);
  });

  it("needs at least one task or a summary (standard form)", () => {
    const empty = reportSchema.parse({ ...base, tasks: [blankTask()] });
    expect(checkReportContent(empty, DEFAULT_SECTIONS)).toEqual({ field: "summary", message: expect.any(String) });
    expect(checkReportContent(reportSchema.parse({ ...base, tasks: [], summary: "Client meetings all day" }), DEFAULT_SECTIONS)).toBeNull();
  });

  it("follows the sections a form keeps", () => {
    const onlyTasks = { ...DEFAULT_SECTIONS, summary: { on: false, label: "Summary" } };
    expect(checkReportContent({ tasks: [], summary: "x" }, onlyTasks)?.field).toBe("tasks");
    const none = { tasks: false, summary: { on: false, label: "S" }, tomorrowPlan: { on: false, label: "T" }, blockers: { on: false, label: "B" } };
    expect(checkReportContent({ tasks: [], summary: "" }, none)).toBeNull();
    expect(keepSections({ tasks: [1], summary: "s", tomorrowPlan: "t", blockers: "b" }, none)).toEqual({ tasks: [], summary: "", tomorrowPlan: "", blockers: "" });
  });

  it("asks for a title when hours were entered", () => {
    const r = reportSchema.safeParse({ ...base, tasks: [{ title: "", hours: 2, status: "DONE" }] });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(["tasks", 0, "title"]);
  });

  it("checks hours: 0–24, quarter steps, total at most 24", () => {
    const withHours = (hours: number | null) => reportSchema.safeParse({ ...base, tasks: [{ title: "Task", hours, status: "DONE" }] });
    expect(withHours(null).success).toBe(true);
    expect(withHours(0).success).toBe(true);
    expect(withHours(2.25).success).toBe(true);
    expect(withHours(24).success).toBe(true);
    expect(withHours(-1).success).toBe(false);
    expect(withHours(24.25).success).toBe(false);
    expect(withHours(1.1).success).toBe(false);
    const over = reportSchema.safeParse({ ...base, tasks: [{ title: "A", hours: 20, status: "DONE" }, { title: "B", hours: 5, status: "DONE" }] });
    expect(over.success).toBe(false);
    expect(over.error!.issues[0]!.message).toMatch(/more than 24/);
  });

  it("rejects unknown statuses, bad dates and over-long text", () => {
    expect(reportSchema.safeParse({ ...base, tasks: [{ title: "x", hours: null, status: "MAYBE" }] }).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, date: "05-11-2026" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, blockers: "x".repeat(1001) }).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, tasks: Array.from({ length: 31 }, () => ({ title: "t", hours: null, status: "DONE" })) }).success).toBe(false);
  });
});

describe("reviewSchema", () => {
  it("allows an empty comment and limits its length", () => {
    expect(reviewSchema.safeParse({ id: 4, comment: "" }).success).toBe(true);
    expect(reviewSchema.safeParse({ id: 4, comment: "x".repeat(501) }).success).toBe(false);
    expect(reviewSchema.safeParse({ id: -1, comment: "" }).success).toBe(false);
  });
});

describe("which days can be filled", () => {
  const today = "2026-11-05";
  it("allows today and up to a week back, never the future", () => {
    expect(checkReportDate(today, today)).toBeNull();
    expect(checkReportDate("2026-10-29", today)).toBeNull();
    expect(checkReportDate("2026-10-28", today)).toMatch(/last 7 days/);
    expect(checkReportDate("2026-11-06", today)).toMatch(/future/);
  });

  it("never before the joining date", () => {
    expect(checkReportDate("2026-11-02", today, "2026-11-03")).toMatch(/before you joined/);
    expect(fillableDates(today, "2026-11-03")).toEqual(["2026-11-05", "2026-11-04", "2026-11-03"]);
  });

  it("lists today and the previous days, newest first", () => {
    const d = fillableDates(today);
    expect(d).toHaveLength(MAX_BACK_DAYS + 1);
    expect(d[0]).toBe(today);
    expect(d.at(-1)).toBe("2026-10-29");
  });
});

describe("helpers", () => {
  it("adds hours, treating blanks as zero", () => {
    expect(totalHours([{ hours: 1.5 }, { hours: null }, { hours: 2.25 }])).toBe(3.75);
    expect(fmtHours(3.75)).toBe("3.75h");
    expect(fmtHours(0)).toBe("0h");
  });

  it("flags a report as blocked by a task or the blockers box", () => {
    expect(isBlocked({ tasks: [{ status: "DONE" }], blockers: "" })).toBe(false);
    expect(isBlocked({ tasks: [{ status: "BLOCKED" }], blockers: "" })).toBe(true);
    expect(isBlocked({ tasks: [], blockers: " Waiting on client assets " })).toBe(true);
    expect(isBlocked({ tasks: [], blockers: "   " })).toBe(false);
  });

  it("reads the tasks JSON defensively", () => {
    expect(parseTasks(null)).toEqual([]);
    expect(parseTasks("nope")).toEqual([]);
    expect(
      parseTasks([
        { title: " Shoot ", hours: 4, status: "DONE" },
        { title: "", hours: 1, status: "DONE" },
        { title: "Edit", hours: "2", status: "WHATEVER" },
        null,
        { title: "Upload", hours: -3, status: "BLOCKED" },
      ]),
    ).toEqual([
      { title: "Shoot", hours: 4, status: "DONE" },
      { title: "Edit", hours: null, status: "DONE" },
      { title: "Upload", hours: null, status: "BLOCKED" },
    ]);
  });

  it("parses page params, ignoring junk", () => {
    expect(pageParams.parse({ view: "team", date: "2026-11-04" })).toEqual({ view: "team", date: "2026-11-04" });
    expect(pageParams.parse({ view: "other", date: "yesterday" })).toEqual({ view: undefined, date: undefined });
  });
});
