import "server-only";
import type { Prisma, RequestStatus, RequestType } from "@prisma/client";
import { loadAllocation } from "@/lib/leave-allocation";
import { computeFromContext, loadContext } from "@/lib/attendance/service";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { addDays, dbToYmd, formatDate, formatTime, istDate, ymdToDb } from "@/lib/time";
import {
  ACTIVE_STATUSES,
  availableBalance,
  checkLeaveBalance,
  checkPermission,
  checkRegularization,
  countWorkingDays,
  eachDate,
  findClash,
  fmtDays,
  REQUEST_STATUS_META,
  REQUEST_TYPE_META,
  speakAbout,
  wfhOverCap,
  type ApprovalParams,
  type NormalizedRequest,
  type RequestSlot,
  type RequestStatusKey,
  type RequestTypeKey,
} from "@/lib/validations/requests";

// ---- Shapes passed to client components (plain, serialisable) ----------------

export interface BalanceRow {
  leaveTypeId: number;
  code: string;
  name: string;
  isPaid: boolean;
  allotted: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;
  /** Max days that carry into next year (null: this type doesn't carry forward). */
  carryLimit: number | null;
}

export interface RequestRow {
  id: number;
  type: RequestTypeKey;
  status: RequestStatusKey;
  leaveType: { id: number; code: string; name: string } | null;
  fromDate: string;
  toDate: string;
  halfDay: "FIRST" | "SECOND" | null;
  startTime: string | null;
  endTime: string | null;
  days: number | null;
  reason: string;
  hasAttachment: boolean;
  decisionComment: string | null;
  decidedAt: string | null;
  approverName: string | null;
  /** Set when HR / a manager entered the request on the employee's behalf */
  enteredByName: string | null;
  createdAt: string;
  employee: { id: number; code: string; name: string; userId: number | null; photo: string | null };
}

export interface RequestFormOptions {
  today: string;
  joiningDate: string;
  exitDate: string | null;
  /** Non-working dates (date -> "Weekly off" or the holiday's name) around the dates people pick */
  offDates: Record<string, string>;
  /** Balances by year (this year and next) */
  balances: Record<string, BalanceRow[]>;
  caps: { wfhPerMonth: number; permissionPerMonth: number; permissionMaxMinutes: number };
  /** Active WFH working days and permission counts per "YYYY-MM" */
  wfhDaysByMonth: Record<string, number>;
  permissionsByMonth: Record<string, number>;
  /** Recorded punches for recent days (for regularization) */
  punches: Record<string, { in: string | null; out: string | null }>;
  /** Active requests, for live clash hints (the server checks again) */
  active: (RequestSlot & { id: number; label: string })[];
}

const rowInclude = {
  leaveType: { select: { id: true, code: true, name: true } },
  approver: { select: { name: true, employee: { select: { fullName: true } } } },
  enteredBy: { select: { name: true, employee: { select: { fullName: true } } } },
  employee: { select: { id: true, code: true, fullName: true, userId: true, photoPath: true } },
} satisfies Prisma.AttendanceRequestInclude;
type RowPayload = Prisma.AttendanceRequestGetPayload<{ include: typeof rowInclude }>;

export function toRow(r: RowPayload): RequestRow {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    leaveType: r.leaveType,
    fromDate: dbToYmd(r.fromDate),
    toDate: dbToYmd(r.toDate),
    halfDay: r.halfDay,
    startTime: r.startTime,
    endTime: r.endTime,
    days: r.days === null ? null : Number(r.days),
    reason: r.reason,
    hasAttachment: !!r.attachmentPath,
    decisionComment: r.decisionComment,
    decidedAt: r.decidedAt ? `${formatDate(istDate(r.decidedAt))}, ${formatTime(r.decidedAt)}` : null,
    approverName: r.approver ? r.approver.employee?.fullName || r.approver.name || "Admin" : null,
    enteredByName: r.enteredBy ? r.enteredBy.employee?.fullName || r.enteredBy.name || "HR" : null,
    createdAt: istDate(r.createdAt),
    employee: { id: r.employee.id, code: r.employee.code, name: r.employee.fullName, userId: r.employee.userId, photo: r.employee.photoPath ? `/api/files/${r.employee.photoPath}` : null },
  };
}

/** "04 Nov 2026" or "04 Nov 2026 – 06 Nov 2026" */
export function describeDates(r: { fromDate: string; toDate: string }): string {
  return r.fromDate === r.toDate ? formatDate(r.fromDate) : `${formatDate(r.fromDate)} – ${formatDate(r.toDate)}`;
}

// ---- Calendar helpers -------------------------------------------------------

/** Weekly offs and holidays for one employee in [from, to] (date -> label). */
export async function offDays(employeeId: number, from: string, to: string): Promise<Record<string, string>> {
  const ctx = await loadContext([employeeId], from, to);
  const out: Record<string, string> = {};
  const now = new Date();
  for (const d of eachDate(from, to)) {
    const v = computeFromContext(ctx, employeeId, d, now);
    if (v.holiday) out[d] = v.holiday;
    else if (v.weeklyOff) out[d] = "Weekly off";
  }
  return out;
}

/** Working days for a request, counted on the server (the client's figure is never used). */
export async function countRequestDays(employeeId: number, from: string, to: string, halfDay: "FIRST" | "SECOND" | null) {
  const off = await offDays(employeeId, from, to);
  return countWorkingDays(from, to, (d) => d in off, halfDay);
}

// ---- Balances ---------------------------------------------------------------

/**
 * Balance per active leave type for a year. Without a LeaveBalance row the allotment is worked out
 * (custom quota by person / designation, plus last year's unused days carried forward; see
 * lib/leave-allocation.ts) and the row is created on the first approval. Pending = leave requests
 * still waiting for a decision that start in that year.
 */
export async function getBalances(employeeId: number, year: number, db: Prisma.TransactionClient = prisma): Promise<BalanceRow[]> {
  const [types, alloc, pending] = await Promise.all([
    db.leaveType.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
    loadAllocation(db, [employeeId], year),
    db.attendanceRequest.groupBy({
      by: ["leaveTypeId"],
      where: { employeeId, type: "LEAVE", status: "PENDING", fromDate: { gte: ymdToDb(`${year}-01-01`), lte: ymdToDb(`${year}-12-31`) } },
      _sum: { days: true },
    }),
  ]);
  return types.map((t) => {
    const f = alloc.figures(employeeId, t.id);
    const figures = {
      allotted: f.allotted,
      carriedForward: f.carriedForward,
      used: f.used,
      pending: Number(pending.find((p) => p.leaveTypeId === t.id)?._sum.days ?? 0),
    };
    return { leaveTypeId: t.id, code: t.code, name: t.name, isPaid: t.isPaid, ...figures, available: availableBalance(figures), carryLimit: t.carryForward ? Number(t.maxCarryForward) : null };
  });
}

// ---- Usage counters (caps) --------------------------------------------------

async function usage(employeeId: number, excludeId?: number) {
  const reqs = await prisma.attendanceRequest.findMany({
    where: { employeeId, type: { in: ["WFH", "PERMISSION"] }, status: { in: ACTIVE_STATUSES }, ...(excludeId && { id: { not: excludeId } }) },
    select: { type: true, fromDate: true, toDate: true },
  });
  const permissionsByMonth: Record<string, number> = {};
  const wfhDaysByMonth: Record<string, number> = {};
  const wfh = reqs.filter((r) => r.type === "WFH").map((r) => ({ from: dbToYmd(r.fromDate), to: dbToYmd(r.toDate) }));
  for (const r of reqs.filter((r) => r.type === "PERMISSION")) {
    const m = dbToYmd(r.fromDate).slice(0, 7);
    permissionsByMonth[m] = (permissionsByMonth[m] ?? 0) + 1;
  }
  if (wfh.length) {
    const from = wfh.map((w) => w.from).sort()[0]!;
    const to = wfh.map((w) => w.to).sort().at(-1)!;
    const off = await offDays(employeeId, from, to);
    for (const w of wfh) {
      for (const d of eachDate(w.from, w.to)) if (!(d in off)) wfhDaysByMonth[d.slice(0, 7)] = (wfhDaysByMonth[d.slice(0, 7)] ?? 0) + 1;
    }
  }
  return { wfhDaysByMonth, permissionsByMonth };
}

// ---- Lists ------------------------------------------------------------------

export async function listMyRequests(employeeId: number, take = 100): Promise<RequestRow[]> {
  const rows = await prisma.attendanceRequest.findMany({ where: { employeeId }, include: rowInclude, orderBy: [{ createdAt: "desc" }], take });
  return rows.map(toRow);
}

/** Requests for the approvals inbox. `ids` limits it to the employees in the approver's reach (null = everyone). */
export async function listApprovals(params: ApprovalParams, ids: number[] | null = null) {
  const reach: Prisma.AttendanceRequestWhereInput = ids ? { employeeId: { in: ids } } : {};
  const statusWhere: Prisma.AttendanceRequestWhereInput =
    params.status === "OPEN" ? { status: { in: ["PENDING", "CANCEL_REQUESTED"] } } : params.status === "ALL" ? {} : { status: params.status as RequestStatus };
  const where: Prisma.AttendanceRequestWhereInput = {
    ...statusWhere,
    ...(params.type !== "ALL" && { type: params.type as RequestType }),
    ...(params.employee && { employeeId: params.employee }),
  };
  // The reach filter is combined with AND so a hand-picked ?employee= can't widen it.
  if (ids) where.AND = [reach];
  const [rows, open] = await Promise.all([
    prisma.attendanceRequest.findMany({
      where,
      include: rowInclude,
      // Open items oldest first (first come, first served); history newest first.
      orderBy: params.status === "OPEN" ? [{ createdAt: "asc" }] : [{ updatedAt: "desc" }],
      take: 200,
    }),
    prisma.attendanceRequest.count({ where: { status: { in: ["PENDING", "CANCEL_REQUESTED"] }, ...reach } }),
  ]);
  return { rows: rows.map(toRow), open };
}

export async function latestRequests(employeeId: number, take = 3) {
  return listMyRequests(employeeId, take);
}

// ---- New-request form -------------------------------------------------------

export async function requestFormOptions(employeeId: number): Promise<RequestFormOptions | null> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { joiningDate: true, exitDate: true } });
  if (!employee) return null;
  const today = istDate();
  const year = Number(today.slice(0, 4));
  const windowFrom = addDays(today, -120);
  const windowTo = `${year + 1}-12-31`;
  const [off, thisYear, nextYear, caps, use, records, active] = await Promise.all([
    offDays(employeeId, windowFrom, windowTo),
    getBalances(employeeId, year),
    getBalances(employeeId, year + 1),
    getSetting("caps"),
    usage(employeeId),
    prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: ymdToDb(addDays(today, -62)), lt: ymdToDb(today) } },
      select: { date: true, punchInAt: true, punchOutAt: true },
    }),
    prisma.attendanceRequest.findMany({
      where: { employeeId, status: { in: ACTIVE_STATUSES }, toDate: { gte: ymdToDb(windowFrom) } },
      select: { id: true, type: true, fromDate: true, toDate: true, halfDay: true, status: true },
    }),
  ]);
  return {
    today,
    joiningDate: dbToYmd(employee.joiningDate),
    exitDate: employee.exitDate ? dbToYmd(employee.exitDate) : null,
    offDates: off,
    balances: { [year]: thisYear, [year + 1]: nextYear },
    caps,
    wfhDaysByMonth: use.wfhDaysByMonth,
    permissionsByMonth: use.permissionsByMonth,
    punches: Object.fromEntries(
      records.map((r) => [dbToYmd(r.date), { in: r.punchInAt ? formatTime(r.punchInAt) : null, out: r.punchOutAt ? formatTime(r.punchOutAt) : null }]),
    ),
    active: active.map((r) => ({
      id: r.id,
      type: r.type,
      fromDate: dbToYmd(r.fromDate),
      toDate: dbToYmd(r.toDate),
      halfDay: r.halfDay,
      status: r.status,
      label: `${REQUEST_TYPE_META[r.type].label} request for ${describeDates({ fromDate: dbToYmd(r.fromDate), toDate: dbToYmd(r.toDate) })}`,
    })),
  };
}

// ---- Server-side validation of a new request ---------------------------------

export type Validation = { ok: true; days: number | null; warning?: string } | { ok: false; error: string; field?: string };

/**
 * Every business rule for a new request. Runs on the server with fresh data. `who` is the
 * employee's name when HR enters it for them: messages then talk about them, not "you".
 */
export async function validateNewRequest(employeeId: number, v: NormalizedRequest, who?: string): Promise<Validation> {
  const res = await checkNewRequest(employeeId, v);
  if (!who) return res;
  return res.ok ? { ...res, warning: res.warning && speakAbout(res.warning.replace(" HR will see that when deciding.", ""), who) } : { ...res, error: speakAbout(res.error, who) };
}

async function checkNewRequest(employeeId: number, v: NormalizedRequest): Promise<Validation> {
  const fail = (error: string, field?: string): Validation => ({ ok: false, error, field });
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { joiningDate: true, exitDate: true } });
  if (!employee) return fail("Your employee record wasn't found.");
  const joining = dbToYmd(employee.joiningDate);
  const exit = employee.exitDate ? dbToYmd(employee.exitDate) : null;
  const today = istDate();
  if (v.fromDate < joining) return fail(`You joined on ${formatDate(joining)}. Pick a date from then on.`, "fromDate");
  if (exit && v.toDate > exit) return fail(`Your last working day is ${formatDate(exit)}.`, "toDate");

  // Clashes with requests that already hold these dates.
  const existing = await prisma.attendanceRequest.findMany({
    where: { employeeId, status: { in: ACTIVE_STATUSES }, fromDate: { lte: ymdToDb(v.toDate) }, toDate: { gte: ymdToDb(v.fromDate) } },
    select: { id: true, type: true, status: true, fromDate: true, toDate: true, halfDay: true },
  });
  const clash = findClash(
    v,
    existing.map((e) => ({ ...e, fromDate: dbToYmd(e.fromDate), toDate: dbToYmd(e.toDate) })),
  );
  if (clash) {
    return fail(
      `Clashes with your ${REQUEST_TYPE_META[clash.type].label.toLowerCase()} request for ${describeDates(clash)} (${REQUEST_STATUS_META[clash.status].label.toLowerCase()}).`,
      "fromDate",
    );
  }

  const off = await offDays(employeeId, v.fromDate, v.toDate);
  const isOff = (d: string) => d in off;

  switch (v.type) {
    case "LEAVE": {
      const type = await prisma.leaveType.findFirst({ where: { id: v.leaveTypeId ?? 0, isActive: true } });
      if (!type) return fail("Pick a valid leave type.", "leaveTypeId");
      const days = countWorkingDays(v.fromDate, v.toDate, isOff, v.halfDay);
      if (days <= 0) return fail("Those dates are all weekly offs or holidays. Nothing to apply for.", "fromDate");
      const balance = (await getBalances(employeeId, Number(v.fromDate.slice(0, 4)))).find((b) => b.leaveTypeId === type.id);
      const error = checkLeaveBalance(days, balance?.available ?? 0, type.isPaid);
      if (error) return fail(error, "leaveTypeId");
      return { ok: true, days };
    }
    case "WFH": {
      const days = countWorkingDays(v.fromDate, v.toDate, isOff);
      if (days <= 0) return fail("Those dates are all weekly offs or holidays.", "fromDate");
      const [caps, use] = await Promise.all([getSetting("caps"), usage(employeeId)]);
      const over = wfhOverCap(eachDate(v.fromDate, v.toDate).filter((d) => !isOff(d)), use.wfhDaysByMonth, caps.wfhPerMonth);
      const warning = over.length ? `This takes WFH past the monthly limit of ${caps.wfhPerMonth} days. HR will see that when deciding.` : undefined;
      return { ok: true, days, warning };
    }
    case "PERMISSION": {
      if (isOff(v.fromDate)) return fail(`${formatDate(v.fromDate)} is a ${off[v.fromDate] === "Weekly off" ? "weekly off" : "holiday"}.`, "fromDate");
      const [caps, use] = await Promise.all([getSetting("caps"), usage(employeeId)]);
      const error = checkPermission(v.startTime!, v.endTime!, use.permissionsByMonth[v.fromDate.slice(0, 7)] ?? 0, caps);
      if (error) return fail(error, "endTime");
      return { ok: true, days: null };
    }
    case "ON_DUTY":
      return { ok: true, days: countWorkingDays(v.fromDate, v.toDate, isOff) };
    case "REGULARIZATION": {
      if (v.fromDate >= today) return fail("Regularization is for past days. Use punch in/out for today.", "fromDate");
      const record = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date: ymdToDb(v.fromDate) } } });
      const error = checkRegularization(record, v);
      if (error) return fail(error, v.startTime ? "endTime" : "startTime");
      return { ok: true, days: null };
    }
  }
}

// ---- Detail (approver drawer) -----------------------------------------------

export interface RequestDetail {
  request: RequestRow;
  employee: { department: string | null; designation: string | null; joiningDate: string };
  /** For leave: available before and after this request (paid types) */
  balance: { name: string; isPaid: boolean; available: number; after: number; year: number } | null;
  /** Attendance on the request's days (first 31 days) */
  days: { date: string; status: string | null; holiday: string | null; weeklyOff: boolean; in: string | null; out: string | null }[];
  /** Other active requests overlapping these dates */
  overlaps: { id: number; label: string; status: RequestStatusKey }[];
  cancellationReason: string | null;
  wfhOverCap: boolean;
  permissionsThisMonth: number | null;
  caps: { wfhPerMonth: number; permissionPerMonth: number; permissionMaxMinutes: number };
}

export async function requestDetail(id: number): Promise<RequestDetail | null> {
  const r = await prisma.attendanceRequest.findUnique({ where: { id }, include: { ...rowInclude, employee: { include: { department: true, designation: true } } } });
  if (!r) return null;
  const row = toRow({ ...r, employee: { id: r.employee.id, code: r.employee.code, fullName: r.employee.fullName, userId: r.employee.userId, photoPath: r.employee.photoPath } });
  const year = Number(row.fromDate.slice(0, 4));
  const to = eachDate(row.fromDate, row.toDate).slice(0, 31).at(-1)!;

  const [balances, ctx, overlaps, cancelAudit, caps, use] = await Promise.all([
    // Balance impact only means something while the request is still open.
    row.type === "LEAVE" && (row.status === "PENDING" || row.status === "CANCEL_REQUESTED") ? getBalances(r.employeeId, year) : null,
    loadContext([r.employeeId], row.fromDate, to),
    prisma.attendanceRequest.findMany({
      where: { employeeId: r.employeeId, id: { not: id }, status: { in: ACTIVE_STATUSES }, fromDate: { lte: r.toDate }, toDate: { gte: r.fromDate } },
      select: { id: true, type: true, status: true, fromDate: true, toDate: true },
    }),
    r.status === "CANCEL_REQUESTED"
      ? prisma.auditLog.findFirst({ where: { entity: "AttendanceRequest", entityId: String(id), action: "CANCEL_REQUEST" }, orderBy: { createdAt: "desc" }, select: { reason: true } })
      : null,
    getSetting("caps"),
    row.type === "WFH" || row.type === "PERMISSION" ? usage(r.employeeId, id) : null,
  ]);

  let balance: RequestDetail["balance"] = null;
  if (balances && row.leaveType) {
    const b = balances.find((x) => x.leaveTypeId === row.leaveType!.id);
    if (b) {
      // A pending request is already inside "pending"; show the figure without it, then after it.
      const own = row.status === "PENDING" ? (row.days ?? 0) : 0;
      const before = b.available + own;
      const delta = row.status === "CANCEL_REQUESTED" ? (row.days ?? 0) : -(row.days ?? 0);
      balance = { name: b.name, isPaid: b.isPaid, available: before, after: before + delta, year };
    }
  }

  const now = new Date();
  const days = eachDate(row.fromDate, to).map((d) => {
    const v = computeFromContext(ctx, r.employeeId, d, now);
    return {
      date: d,
      status: v.status,
      holiday: v.holiday,
      weeklyOff: v.weeklyOff,
      in: v.record?.punchInAt ? formatTime(v.record.punchInAt) : null,
      out: v.record?.punchOutAt ? formatTime(v.record.punchOutAt) : null,
    };
  });

  let overCap = false;
  if (row.type === "WFH" && use) {
    const off = await offDays(r.employeeId, row.fromDate, row.toDate);
    overCap = wfhOverCap(eachDate(row.fromDate, row.toDate).filter((d) => !(d in off)), use.wfhDaysByMonth, caps.wfhPerMonth).length > 0;
  }

  return {
    request: row,
    employee: { department: r.employee.department?.name ?? null, designation: r.employee.designation?.name ?? null, joiningDate: dbToYmd(r.employee.joiningDate) },
    balance,
    days,
    overlaps: overlaps.map((o) => ({
      id: o.id,
      status: o.status,
      label: `${REQUEST_TYPE_META[o.type].label} · ${describeDates({ fromDate: dbToYmd(o.fromDate), toDate: dbToYmd(o.toDate) })}`,
    })),
    cancellationReason: cancelAudit?.reason ?? null,
    wfhOverCap: overCap,
    permissionsThisMonth: row.type === "PERMISSION" && use ? (use.permissionsByMonth[row.fromDate.slice(0, 7)] ?? 0) : null,
    caps,
  };
}

/** "2 days of Casual Leave", "WFH for 3 days", … for notifications. */
export function requestSummary(r: { type: RequestTypeKey; fromDate: string; toDate: string; days: number | null; leaveType?: { name: string } | null; startTime?: string | null; endTime?: string | null }) {
  const when = describeDates(r);
  switch (r.type) {
    case "LEAVE":
      return `${r.leaveType?.name ?? "Leave"} · ${when}${r.days ? ` (${fmtDays(r.days)})` : ""}`;
    case "PERMISSION":
      return `Permission · ${when}${r.startTime ? `, ${r.startTime}–${r.endTime}` : ""}`;
    default:
      return `${REQUEST_TYPE_META[r.type].label} · ${when}`;
  }
}
