"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { teamDay } from "@/lib/daily-reports";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { actionUser, canReachEmployee, Forbidden, scopeEmployeeIds } from "@/lib/session";
import { addDays, dbToYmd, formatDate, istDate, ymdToDb } from "@/lib/time";
import { formForEmployee } from "@/lib/report-forms";
import { checkReportContent, checkReportDate, keepSections, MAX_BACK_DAYS, reportSchema, reviewSchema, totalHours } from "@/lib/validations/daily-reports";
import { checkAnswers } from "@/lib/validations/report-forms";

export type ReportResult = { ok: true; id: number; message: string } | { ok: false; error: string; field?: string };
export type SimpleResult = { ok: true; message: string } | { ok: false; error: string };

const fail = (error: string, field?: string) => ({ ok: false as const, error, field });

function revalidate() {
  revalidatePath("/daily-reports");
  revalidatePath("/dashboard");
}

// ---- Employee: send / edit --------------------------------------------------

/**
 * Creates or updates the signed-in employee's report for one day (today or up to
 * MAX_BACK_DAYS back). The employee always comes from the session. A reviewed report is final.
 */
export async function saveDailyReport(input: unknown): Promise<ReportResult> {
  try {
    const actor = await actionUser();
    if (!actor.employeeId) return fail("Your sign-in isn't linked to an employee record.");
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));

    // The report form for this person decides which sections count and the extra fields.
    const reportForm = await formForEmployee(actor.employeeId);
    const v = keepSections(parsed.data, reportForm.sections);
    const content = checkReportContent(v, reportForm.sections);
    if (content) return fail(content.message, content.field);
    const checked = checkAnswers(reportForm.fields, v.answers);
    if (!checked.ok) return fail(checked.message, `answer:${checked.fieldId}`);

    const employee = await prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { joiningDate: true } });
    const dateError = checkReportDate(v.date, istDate(), employee ? dbToYmd(employee.joiningDate) : null);
    if (dateError) return fail(dateError, "date");

    const key = { employeeId_date: { employeeId: actor.employeeId, date: ymdToDb(v.date) } };
    const data = {
      tasks: v.tasks as unknown as Prisma.InputJsonValue,
      summary: v.summary,
      tomorrowPlan: v.tomorrowPlan,
      blockers: v.blockers,
      answers: checked.answers.length ? (checked.answers as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    const after = { date: v.date, tasks: v.tasks.length, hours: totalHours(v.tasks), blockers: !!v.blockers };

    const saved = await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyReport.findUnique({ where: key });
      if (existing?.reviewedAt) throw new Forbidden("This report has been reviewed and can't be changed any more.");
      if (existing) {
        // Guarded on reviewedAt so a review landing in between wins.
        const res = await tx.dailyReport.updateMany({ where: { id: existing.id, reviewedAt: null }, data });
        if (res.count !== 1) throw new Forbidden("This report was reviewed in the meantime. Refresh the page.");
        await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "DailyReport", entityId: existing.id, before: { tasks: parseCount(existing.tasks), blockers: !!existing.blockers }, after }, tx);
        return { id: existing.id, created: false };
      }
      const r = await tx.dailyReport.create({ data: { ...data, employeeId: actor.employeeId!, date: ymdToDb(v.date) } });
      await writeAudit({ actorId: actor.id, action: "CREATE", entity: "DailyReport", entityId: r.id, after }, tx);
      return { id: r.id, created: true };
    });

    revalidate();
    return { ok: true, id: saved.id, message: saved.created ? "Report sent" : "Report updated" };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    // Two tabs creating the same day at once: the unique key catches the second.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("This day's report was just sent from somewhere else. Refresh the page.");
    console.error("saveDailyReport failed", err);
    return fail("Could not send the report. Try again.");
  }
}

const parseCount = (tasks: Prisma.JsonValue) => (Array.isArray(tasks) ? tasks.length : 0);

// ---- Reviewer ---------------------------------------------------------------

/** Marks a report as read, with an optional comment, and tells the employee. */
export async function reviewDailyReport(input: unknown): Promise<SimpleResult> {
  try {
    const actor = await actionUser("dailyreports.review");
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message);
    const { id, comment } = parsed.data;

    const r = await prisma.dailyReport.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
    if (!r || !(await canReachEmployee(actor, r.employeeId))) return fail("That report isn't in your reach.");
    if (r.employee.userId === actor.id && !actor.isSuperAdmin) return fail("You can't review your own report.");
    if (r.reviewedAt) return fail("This report has already been reviewed.");

    await prisma.$transaction(async (tx) => {
      const res = await tx.dailyReport.updateMany({ where: { id, reviewedAt: null }, data: { reviewedById: actor.id, reviewedAt: new Date(), reviewComment: comment || null } });
      if (res.count !== 1) throw new Forbidden("This report was reviewed in the meantime. Refresh the page.");
      await writeAudit({ actorId: actor.id, action: "REVIEW", entity: "DailyReport", entityId: id, after: { reviewed: true, comment: comment || null } }, tx);
    });

    if (r.employee.userId) {
      const day = formatDate(dbToYmd(r.date));
      await notifyUsers([r.employee.userId], {
        title: `Your daily report for ${day} was reviewed`,
        body: comment ? `${actor.name}: ${comment}` : `${actor.name} has read your report.`,
        link: `/daily-reports?view=mine&date=${dbToYmd(r.date)}`,
      }).catch((e) => console.error("notify failed", e));
    }

    revalidate();
    return { ok: true, message: "Marked as reviewed" };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("reviewDailyReport failed", err);
    return fail("Could not save the review. Try again.");
  }
}

/** In-app + email reminder to everyone in reach who was expected on `date` and hasn't reported. */
export async function remindMissing(date: string): Promise<SimpleResult & { sent?: number }> {
  try {
    const actor = await actionUser("dailyreports.review");
    const today = istDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < addDays(today, -MAX_BACK_DAYS)) {
      return fail(`Reminders can only go out for the last ${MAX_BACK_DAYS} days.`);
    }
    const day = await teamDay(date, await scopeEmployeeIds(actor));
    const ids = day.missing.filter((m) => m.hasLogin).map((m) => m.id);
    if (!ids.length) return fail("Nobody to remind: everyone missing has no sign-in.");
    const users = await prisma.employee.findMany({ where: { id: { in: ids }, userId: { not: null } }, select: { userId: true } });
    const userIds = users.map((u) => u.userId!).filter((id) => id !== actor.id);
    if (!userIds.length) return fail("Nobody else to remind.");

    await notifyUsers(userIds, {
      title: date === today ? "Reminder: send today's report" : `Reminder: your daily report for ${formatDate(date)}`,
      body: "Note what you worked on, tomorrow's plan and anything blocking you. It takes a minute.",
      link: date === today ? "/daily-reports?view=mine" : `/daily-reports?view=mine&date=${date}`,
      popup: true,
    });
    await writeAudit({ actorId: actor.id, action: "REMIND", entity: "DailyReport", entityId: null, after: { date, employees: ids.length } });
    return { ok: true, message: `Reminder sent to ${userIds.length} ${userIds.length === 1 ? "person" : "people"}`, sent: userIds.length };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("remindMissing failed", err);
    return fail("Could not send the reminders. Try again.");
  }
}
