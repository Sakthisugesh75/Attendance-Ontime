import "server-only";
import type { AttendanceStatus, Prisma } from "@prisma/client";
import { computeFromContext, loadContext } from "@/lib/attendance/service";
import { prisma } from "@/lib/prisma";
import { addDays, dbToYmd, formatDate, formatTime, istDate, ymdToDb } from "@/lib/time";
import { fillableDates, isBlocked, parseTasks, totalHours, type TaskInput } from "@/lib/validations/daily-reports";
import { formForEmployee } from "@/lib/report-forms";
import { parseAnswers, type Answer } from "@/lib/validations/report-forms";

/**
 * Daily work reports: read models for the page, the dashboard card and the cron reminder.
 * Everything here is serializable so it can go straight to client components.
 */

export interface ReportRow {
  id: number;
  date: string;
  tasks: TaskInput[];
  summary: string;
  tomorrowPlan: string;
  blockers: string;
  /** Custom fields of the report form, as sent */
  answers: Answer[];
  hours: number;
  blocked: boolean;
  /** "06:42 PM" IST */
  submittedAt: string;
  submittedDate: string;
  /** Changed after it was first sent */
  edited: boolean;
  reviewed: { by: string; at: string; comment: string | null } | null;
}

export interface TeamReportRow extends ReportRow {
  employee: { id: number; code: string; name: string; department: string | null; photo: string | null };
  workedMinutes: number | null;
}

/** Attendance hint for one day: hours at work and the day's status. */
export interface DayHint {
  status: AttendanceStatus | null;
  label: string | null;
  workedMinutes: number;
  /** Punched in, not out yet: minutes counted up to now */
  inProgress: boolean;
}

const reportInclude = { reviewedBy: { select: { name: true, email: true, employee: { select: { fullName: true } } } } } satisfies Prisma.DailyReportInclude;
type ReportWithReviewer = Prisma.DailyReportGetPayload<{ include: typeof reportInclude }>;

const photoUrl = (p: string | null) => (p ? `/api/files/${p}` : null);

function toRow(r: ReportWithReviewer): ReportRow {
  const tasks = parseTasks(r.tasks);
  return {
    id: r.id,
    date: dbToYmd(r.date),
    tasks,
    summary: r.summary,
    tomorrowPlan: r.tomorrowPlan,
    blockers: r.blockers,
    answers: parseAnswers(r.answers),
    hours: totalHours(tasks),
    blocked: isBlocked({ tasks, blockers: r.blockers }),
    submittedAt: formatTime(r.submittedAt),
    submittedDate: istDate(r.submittedAt),
    edited: r.updatedAt.getTime() - r.submittedAt.getTime() > 60_000,
    reviewed: r.reviewedAt
      ? {
          by: r.reviewedBy?.employee?.fullName || r.reviewedBy?.name || r.reviewedBy?.email || "Reviewer",
          at: `${formatDate(istDate(r.reviewedAt))}, ${formatTime(r.reviewedAt)}`,
          comment: r.reviewComment,
        }
      : null,
  };
}

const OFF_LABEL: Partial<Record<AttendanceStatus, string>> = { HOLIDAY: "Holiday", WEEKLY_OFF: "Weekly off", LEAVE: "On leave", NOT_JOINED: "Not joined", EXITED: "Exited" };
/** Statuses where nobody expects a report. */
const NOT_EXPECTED: AttendanceStatus[] = ["HOLIDAY", "WEEKLY_OFF", "LEAVE", "NOT_JOINED", "EXITED"];

// ---- Employee ---------------------------------------------------------------

/** The employee's own page: the last 30 reports and an attendance hint for each fillable day. */
export async function myReportsData(employeeId: number, now = new Date()) {
  const today = istDate(now);
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { joiningDate: true } });
  const joiningDate = dbToYmd(employee.joiningDate);
  const dates = fillableDates(today, joiningDate);
  const [reports, hints, form] = await Promise.all([
    prisma.dailyReport.findMany({ where: { employeeId }, include: reportInclude, orderBy: { date: "desc" }, take: 30 }),
    dates.length ? dayHints([employeeId], dates.at(-1)!, today, now) : new Map<string, DayHint>(),
    formForEmployee(employeeId),
  ]);
  return {
    today,
    /** The report form this person fills in */
    form,
    dates,
    reports: reports.map(toRow),
    hints: Object.fromEntries(dates.map((d) => [d, hints.get(`${employeeId}:${d}`) ?? null])) as Record<string, DayHint | null>,
  };
}
export type MyReportsData = Awaited<ReturnType<typeof myReportsData>>;

/** Status and worked time per "employeeId:date" over a range, from the attendance rules. */
async function dayHints(employeeIds: number[], from: string, to: string, now = new Date()): Promise<Map<string, DayHint>> {
  const out = new Map<string, DayHint>();
  if (!employeeIds.length) return out;
  const ctx = await loadContext(employeeIds, from, to);
  for (const id of employeeIds) {
    for (let d = to; d >= from; d = addDays(d, -1)) {
      const v = computeFromContext(ctx, id, d, now);
      const open = !!v.record?.punchInAt && !v.record.punchOutAt && d === istDate(now);
      out.set(`${id}:${d}`, {
        status: v.status,
        label: v.holiday ?? (v.status ? (OFF_LABEL[v.status] ?? null) : null),
        workedMinutes: open ? Math.max(0, Math.floor((now.getTime() - v.record!.punchInAt!.getTime()) / 60000)) : v.workedMinutes,
        inProgress: open,
      });
    }
  }
  return out;
}

/** For the dashboard card: has today's report gone in? */
export async function todayReportStatus(employeeId: number, now = new Date()) {
  const date = istDate(now);
  const r = await prisma.dailyReport.findUnique({ where: { employeeId_date: { employeeId, date: ymdToDb(date) } }, include: reportInclude });
  if (!r) return { date, sent: false as const };
  const row = toRow(r);
  return { date, sent: true as const, submittedAt: row.submittedAt, taskCount: row.tasks.length, hours: row.hours, blocked: row.blocked, reviewed: !!row.reviewed };
}
export type TodayReportStatus = Awaited<ReturnType<typeof todayReportStatus>>;

// ---- Reviewers --------------------------------------------------------------

export interface MissingRow {
  id: number;
  code: string;
  name: string;
  department: string | null;
  photo: string | null;
  hasLogin: boolean;
  /** "Absent", "WFH", "Not punched in" … */
  note: string | null;
}

// ---- Who is expected to report --------------------------------------------------------

/** What decides it: the person's own setting, else their sign-in role's switch. */
export const REPORT_RULE_SELECT = { reportRequired: true, user: { select: { accessRole: { select: { dailyReports: true } } } } } as const;

/**
 * Is a daily report expected from this employee? The person's override wins; otherwise their
 * sign-in role decides; people without a sign-in follow the built-in Employee role.
 */
export function reportExpected(e: { reportRequired: boolean | null; user: { accessRole: { dailyReports: boolean } | null } | null }, employeeRoleDefault: boolean): boolean {
  return e.reportRequired ?? e.user?.accessRole?.dailyReports ?? employeeRoleDefault;
}

/** The built-in Employee role's switch (the default for people without a sign-in). */
export async function employeeRoleReports(): Promise<boolean> {
  const role = await prisma.accessRole.findUnique({ where: { systemKey: "EMPLOYEE" }, select: { dailyReports: true } });
  return role?.dailyReports ?? true;
}

/**
 * One day for a reviewer: every report from employees in reach, and the active employees in
 * reach who were expected (not on leave, holiday or weekly off) but haven't sent one.
 */
export async function teamDay(ymd: string, reach: number[] | null, now = new Date()) {
  const day = ymdToDb(ymd);
  const [reports, employees] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { date: day, ...(reach && { employeeId: { in: reach } }) },
      include: { ...reportInclude, employee: { select: { id: true, code: true, fullName: true, photoPath: true, department: { select: { name: true } } } } },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: { not: "EXITED" },
        ...(reach && { id: { in: reach } }),
        joiningDate: { lte: day },
        OR: [{ exitDate: null }, { exitDate: { gte: day } }],
      },
      select: { id: true, code: true, fullName: true, photoPath: true, userId: true, department: { select: { name: true } }, ...REPORT_RULE_SELECT },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const roleDefault = await employeeRoleReports();
  const hints = await dayHints(
    [...new Set([...employees.map((e) => e.id), ...reports.map((r) => r.employeeId)])],
    ymd,
    ymd,
    now,
  );
  const sent = new Set(reports.map((r) => r.employeeId));

  const rows: TeamReportRow[] = reports.map((r) => {
    const h = hints.get(`${r.employeeId}:${ymd}`);
    return {
      ...toRow(r),
      employee: { id: r.employee.id, code: r.employee.code, name: r.employee.fullName, department: r.employee.department?.name ?? null, photo: photoUrl(r.employee.photoPath) },
      workedMinutes: h && h.workedMinutes > 0 ? h.workedMinutes : null,
    };
  });

  const missing: MissingRow[] = [];
  let notExpected = 0;
  let notRequired = 0;
  for (const e of employees) {
    if (sent.has(e.id)) continue;
    // Their role (or their own setting) says no report is needed.
    if (!reportExpected(e, roleDefault)) {
      notRequired++;
      continue;
    }
    const h = hints.get(`${e.id}:${ymd}`);
    if (h?.status && NOT_EXPECTED.includes(h.status)) {
      notExpected++;
      continue;
    }
    missing.push({
      id: e.id,
      code: e.code,
      name: e.fullName,
      department: e.department?.name ?? null,
      photo: photoUrl(e.photoPath),
      hasLogin: !!e.userId,
      note: missingNote(h),
    });
  }

  return {
    date: ymd,
    rows,
    missing,
    stats: {
      submitted: rows.length,
      missing: missing.length,
      blocked: rows.filter((r) => r.blocked).length,
      awaitingReview: rows.filter((r) => !r.reviewed).length,
      notExpected,
      notRequired,
    },
  };
}
export type TeamDay = Awaited<ReturnType<typeof teamDay>>;

function missingNote(h: DayHint | undefined): string | null {
  if (!h?.status) return "Not punched in";
  if (h.status === "ABSENT") return "Absent";
  if (h.status === "WFH") return "WFH";
  if (h.status === "ON_DUTY") return "On duty";
  if (h.status === "MISSING_PUNCH_OUT") return "No punch-out";
  if (h.inProgress) return "At work";
  return null;
}

/** Employees with a login who punched in on `ymd` and haven't sent that day's report. */
export async function punchedInWithoutReport(ymd: string) {
  const day = ymdToDb(ymd);
  const [people, roleDefault] = await Promise.all([
    prisma.employee.findMany({
      where: {
        deletedAt: null,
        userId: { not: null },
        attendance: { some: { date: day, punchInAt: { not: null } } },
        dailyReports: { none: { date: day } },
      },
      select: { id: true, userId: true, fullName: true, ...REPORT_RULE_SELECT },
    }),
    employeeRoleReports(),
  ]);
  // Only people who are expected to report get the reminder.
  return people.filter((p) => reportExpected(p, roleDefault)).map(({ id, userId, fullName }) => ({ id, userId, fullName }));
}

/** Reports in a date range for the Excel export, oldest first. */
export async function reportsForExport(from: string, to: string, reach: number[] | null) {
  const reports = await prisma.dailyReport.findMany({
    where: { date: { gte: ymdToDb(from), lte: ymdToDb(to) }, ...(reach && { employeeId: { in: reach } }) },
    include: { ...reportInclude, employee: { select: { code: true, fullName: true, department: { select: { name: true } } } } },
    orderBy: [{ date: "asc" }, { employee: { fullName: "asc" } }],
  });
  return reports.map((r) => ({ ...toRow(r), employee: { code: r.employee.code, name: r.employee.fullName, department: r.employee.department?.name ?? "" } }));
}
