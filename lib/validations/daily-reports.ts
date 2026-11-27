import { z } from "zod";
import { addDays } from "@/lib/time";
import { answerInput, type FormSections } from "./report-forms";

/**
 * Daily work reports: the form schema shared by the report form (client) and the server
 * actions, plus the pure rules (which days can be filled, totals, blocked) both sides use.
 * Nothing here touches the database.
 */

export const TASK_STATUSES = ["DONE", "IN_PROGRESS", "BLOCKED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Tailwind needs literal class names, so every status spells its classes out. */
export const TASK_STATUS_META: Record<TaskStatus, { label: string; dot: string; chip: string }> = {
  DONE: { label: "Done", dot: "bg-st-present", chip: "bg-st-present/12 text-st-present ring-st-present/25" },
  IN_PROGRESS: { label: "In progress", dot: "bg-st-permission", chip: "bg-st-permission/12 text-st-permission ring-st-permission/25" },
  BLOCKED: { label: "Blocked", dot: "bg-st-absent", chip: "bg-st-absent/12 text-st-absent ring-st-absent/25" },
};

/** How many days back a missed report can still be filled (today is day 0). */
export const MAX_BACK_DAYS = 7;
export const MAX_TASKS = 30;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const taskSchema = z
  .object({
    title: z.string().trim().max(200, "Keep the task under 200 characters"),
    hours: z.number({ invalid_type_error: "Enter hours as a number" }).min(0, "Hours can't be negative").max(24, "At most 24 hours").multipleOf(0.25, "Use quarter hours (e.g. 1.5 or 2.25)").nullable(),
    status: z.enum(TASK_STATUSES),
  })
  .superRefine((t, ctx) => {
    if (!t.title && t.hours !== null) ctx.addIssue({ code: "custom", path: ["title"], message: "Describe the task or remove the row" });
  });
export type TaskInput = z.infer<typeof taskSchema>;

/** Rows left completely blank are dropped, so an untouched empty row never blocks sending. */
export const reportSchema = z
  .object({
    date: ymd,
    tasks: z
      .array(taskSchema)
      .max(MAX_TASKS, `At most ${MAX_TASKS} tasks`)
      .transform((rows) => rows.filter((r) => r.title)),
    summary: z.string().trim().max(2000, "Keep the summary under 2000 characters"),
    tomorrowPlan: z.string().trim().max(1000, "Keep the plan under 1000 characters"),
    blockers: z.string().trim().max(1000, "Keep the blockers under 1000 characters"),
    /** Custom fields of the report form (checked against the form on the server) */
    answers: answerInput.default([]),
  })
  .superRefine((v, ctx) => {
    if (totalHours(v.tasks) > 24) ctx.addIssue({ code: "custom", path: ["tasks"], message: "The hours add up to more than 24" });
  });
export type ReportInput = z.input<typeof reportSchema>;
export type ReportValues = z.output<typeof reportSchema>;

/**
 * Content rule for the form in use: with both tasks and summary on, one of them is needed;
 * with only one on, that one is needed. Returns the field and message, or null.
 */
export function checkReportContent(v: { tasks: { title: string }[]; summary: string }, sections: FormSections): { field: "tasks" | "summary"; message: string } | null {
  const tasks = v.tasks.filter((t) => t.title.trim()).length;
  const summary = v.summary.trim();
  if (sections.tasks && sections.summary.on) return tasks || summary ? null : { field: "summary", message: `Add at least one task or a short ${sections.summary.label.toLowerCase()}` };
  if (sections.tasks) return tasks ? null : { field: "tasks", message: "Add at least one task" };
  if (sections.summary.on) return summary ? null : { field: "summary", message: `Fill in ${sections.summary.label.toLowerCase()}` };
  return null;
}

/** Drops values of sections the form has switched off. */
export function keepSections<T extends { tasks: unknown[]; summary: string; tomorrowPlan: string; blockers: string }>(v: T, s: FormSections): T {
  return { ...v, tasks: s.tasks ? v.tasks : [], summary: s.summary.on ? v.summary : "", tomorrowPlan: s.tomorrowPlan.on ? v.tomorrowPlan : "", blockers: s.blockers.on ? v.blockers : "" };
}

export const reviewSchema = z.object({
  id: z.number().int().positive(),
  comment: z.string().trim().max(500, "Keep the comment under 500 characters"),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/** ?view=&date= on the page. A bad date falls back to today (decided by the page). */
export const pageParams = z.object({
  view: z.enum(["mine", "team"]).optional().catch(undefined),
  date: ymd.optional().catch(undefined),
});

export const blankTask = (): TaskInput => ({ title: "", hours: null, status: "DONE" });

// ---- Rules ------------------------------------------------------------------

/** Why `date` can't be written on `today` (both IST "YYYY-MM-DD"), or null when it can. */
export function checkReportDate(date: string, today: string, joiningDate?: string | null): string | null {
  if (date > today) return "You can't send a report for a future day.";
  if (date < addDays(today, -MAX_BACK_DAYS)) return `Reports can only be filled for the last ${MAX_BACK_DAYS} days.`;
  if (joiningDate && date < joiningDate) return "That's before you joined.";
  return null;
}

/** The days that can be filled, newest first: today and the MAX_BACK_DAYS before it. */
export function fillableDates(today: string, joiningDate?: string | null): string[] {
  return Array.from({ length: MAX_BACK_DAYS + 1 }, (_, i) => addDays(today, -i)).filter((d) => !joiningDate || d >= joiningDate);
}

export function totalHours(tasks: { hours: number | null }[]): number {
  return tasks.reduce((s, t) => s + (t.hours ?? 0), 0);
}

/** True when a task is blocked or the blockers box has something in it. */
export function isBlocked(r: { tasks: { status: string }[]; blockers: string }): boolean {
  return !!r.blockers.trim() || r.tasks.some((t) => t.status === "BLOCKED");
}

/** The tasks JSON column, read defensively (bad rows are skipped, never thrown). */
export function parseTasks(value: unknown): TaskInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t): TaskInput[] => {
    if (!t || typeof t !== "object") return [];
    const o = t as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) return [];
    const hours = typeof o.hours === "number" && Number.isFinite(o.hours) && o.hours >= 0 ? o.hours : null;
    const status = (TASK_STATUSES as readonly string[]).includes(o.status as string) ? (o.status as TaskStatus) : "DONE";
    return [{ title, hours, status }];
  });
}

/** 7.5 -> "7.5h", 0.25 -> "0.25h", 0 -> "0h" */
export const fmtHours = (h: number) => `${Number(h.toFixed(2))}h`;
