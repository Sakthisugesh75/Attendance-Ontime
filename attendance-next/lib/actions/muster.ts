"use server";

import type { AttendanceRecord, AttendanceStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { computeFromContext, loadContext, recomputeDay, shiftFor } from "@/lib/attendance/service";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { actionUser, canReachEmployee, Forbidden, hasPermission, scopeEmployeeIds } from "@/lib/session";
import { STATUS_META } from "@/lib/status";
import { dbToYmd, formatDate, formatHhmm, formatTime, istAt, istDate, istMinutes, minutesToHhmm, weekdayOf, ymdToDb } from "@/lib/time";
import { bulkMarkSchema, musterEditSchema, type BulkMarkInput, type MusterEditInput } from "@/lib/validations/muster";

type Fail = { ok: false; error: string; field?: string };
const fail = (error: string, field?: string): Fail => ({ ok: false, error, field });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The editable part of a record, as shown in the audit trail. */
interface Snapshot {
  punchIn: string | null;
  punchOut: string | null;
  statusOverride: AttendanceStatus | null;
  remarks: string | null;
  source: string;
}

function snapshot(r: Pick<AttendanceRecord, "punchInAt" | "punchOutAt" | "statusOverride" | "remarks" | "source">, date: string): Snapshot {
  return {
    punchIn: r.punchInAt ? minutesToHhmm(istMinutes(r.punchInAt, date)) : null,
    punchOut: r.punchOutAt ? minutesToHhmm(istMinutes(r.punchOutAt, date)) : null,
    statusOverride: r.statusOverride,
    remarks: r.remarks,
    source: r.source,
  };
}

const sameEdit = (a: Snapshot | null, b: Snapshot) =>
  !!a && a.punchIn === b.punchIn && a.punchOut === b.punchOut && a.statusOverride === b.statusOverride && (a.remarks ?? null) === (b.remarks ?? null);

function revalidate() {
  revalidatePath("/muster");
  revalidatePath("/reports");
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

/** Whether a date can be edited for an employee: not upcoming, inside employment. */
function editBlock(date: string, joining: string, exit: string | null): string | null {
  if (date > istDate()) return "Upcoming days can't be edited.";
  if (date < joining) return `Before their joining date (${formatDate(joining)}).`;
  if (exit && date > exit) return `After their exit date (${formatDate(exit)}).`;
  return null;
}

// ---------------------------------------------------------------------------
// Day detail (read)
// ---------------------------------------------------------------------------

const FIELD_LABEL: Record<string, string> = {
  punchIn: "Punch in",
  punchOut: "Punch out",
  statusOverride: "Status",
  status: "Status",
  remarks: "Remarks",
  source: "Source",
};

function showValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return field === "statusOverride" ? "Automatic" : "—";
  if ((field === "punchIn" || field === "punchOut") && typeof v === "string") {
    if (/^\d{2}:\d{2}$/.test(v)) return formatHhmm(v);
    if (!Number.isNaN(Date.parse(v))) return formatTime(v);
  }
  if ((field === "statusOverride" || field === "status") && typeof v === "string" && v in STATUS_META) return STATUS_META[v as AttendanceStatus].label;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export interface AuditItem {
  id: number;
  when: string;
  actor: string;
  action: string;
  reason: string | null;
  changes: { field: string; before: string; after: string }[];
}

export interface DayDetail {
  employee: { id: number; name: string; code: string; department: string | null };
  date: string;
  status: AttendanceStatus | null;
  flags: string[];
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  holiday: string | null;
  weeklyOff: boolean;
  shift: { start: number; end: number } | null;
  record: {
    id: number;
    punchIn: string | null;
    punchOut: string | null;
    inLocation: { lat: number; lng: number; accuracy: number | null } | null;
    outLocation: { lat: number; lng: number; accuracy: number | null } | null;
    inSelfie: string | null;
    outSelfie: string | null;
    statusOverride: AttendanceStatus | null;
    source: string;
    remarks: string | null;
    updated: string;
  } | null;
  requests: { type: string; detail: string }[];
  audit: AuditItem[];
  editBlock: string | null;
}

function changesOf(before: unknown, after: unknown): AuditItem["changes"] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => k !== "source");
  return keys
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({ field: FIELD_LABEL[k] ?? k, before: showValue(k, b[k]), after: showValue(k, a[k]) }));
}

/** Everything the muster side sheet shows for one employee-day, including its audit trail. */
export async function getMusterDay(employeeId: number, date: string): Promise<{ ok: true; day: DayDetail } | Fail> {
  try {
    const actor = await actionUser("attendance.view");
    const id = z.number().int().positive().parse(employeeId);
    const d = ymd.parse(date);
    if (!(await canReachEmployee(actor, id))) return fail("Employee not found.");
    const emp = await prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, fullName: true, code: true, joiningDate: true, exitDate: true, department: { select: { name: true } } },
    });
    if (!emp) return fail("Employee not found.");

    const ctx = await loadContext([id], d, d);
    const view = computeFromContext(ctx, id, d);
    const r = view.record;
    const [audit, requests] = await Promise.all([
      r
        ? prisma.auditLog.findMany({
            where: { entity: "AttendanceRecord", entityId: String(r.id) },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { actor: { select: { name: true, username: true, employee: { select: { fullName: true } } } } },
          })
        : [],
      prisma.attendanceRequest.findMany({
        where: { employeeId: id, status: { in: ["APPROVED", "CANCEL_REQUESTED"] }, fromDate: { lte: ymdToDb(d) }, toDate: { gte: ymdToDb(d) } },
        include: { leaveType: { select: { name: true } } },
      }),
    ]);

    const loc = (lat: Prisma.Decimal | null, lng: Prisma.Decimal | null, accuracy: number | null) =>
      lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng), accuracy } : null;
    const hhmm = (t: Date | null) => (t ? minutesToHhmm(istMinutes(t, d)) : null);

    return {
      ok: true,
      day: {
        employee: { id: emp.id, name: emp.fullName, code: emp.code, department: emp.department?.name ?? null },
        date: d,
        status: view.status,
        flags: view.flags,
        workedMinutes: view.workedMinutes,
        lateMinutes: view.lateMinutes,
        earlyLeaveMinutes: view.earlyLeaveMinutes,
        overtimeMinutes: view.overtimeMinutes,
        holiday: view.holiday,
        weeklyOff: view.weeklyOff,
        shift: view.timing ? { start: view.timing.start, end: view.timing.end } : null,
        record: r
          ? {
              id: r.id,
              punchIn: hhmm(r.punchInAt),
              punchOut: hhmm(r.punchOutAt),
              inLocation: loc(r.punchInLat, r.punchInLng, r.punchInAccuracy),
              outLocation: loc(r.punchOutLat, r.punchOutLng, r.punchOutAccuracy),
              inSelfie: r.punchInSelfie ? `/api/files/${r.punchInSelfie}` : null,
              outSelfie: r.punchOutSelfie ? `/api/files/${r.punchOutSelfie}` : null,
              statusOverride: r.statusOverride,
              source: r.source,
              remarks: r.remarks,
              updated: `${formatDate(istDate(r.updatedAt))}, ${formatTime(r.updatedAt)}`,
            }
          : null,
        requests: requests.map((q) => ({
          type: q.type,
          detail: [q.leaveType?.name, q.halfDay ? `${q.halfDay === "FIRST" ? "first" : "second"} half` : null, q.startTime && q.endTime ? `${formatHhmm(q.startTime)} – ${formatHhmm(q.endTime)}` : null]
            .filter(Boolean)
            .join(" · "),
        })),
        audit: audit.map((a) => ({
          id: a.id,
          when: `${formatDate(istDate(a.createdAt))}, ${formatTime(a.createdAt)}`,
          actor: a.actor?.employee?.fullName ?? (a.actor?.name || a.actor?.username) ?? "System",
          action: a.action,
          reason: a.reason,
          changes: changesOf(a.before, a.after),
        })),
        editBlock: hasPermission(actor, "attendance.edit")
          ? editBlock(d, dbToYmd(emp.joiningDate), emp.exitDate ? dbToYmd(emp.exitDate) : null)
          : "You can view this day but not change it.",
      },
    };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("getMusterDay failed", err);
    return fail("Could not load this day. Try again.");
  }
}

// ---------------------------------------------------------------------------
// Edit one day
// ---------------------------------------------------------------------------

export async function saveMusterDay(input: MusterEditInput): Promise<{ ok: true; message: string } | Fail> {
  try {
    const actor = await actionUser("attendance.edit");
    const parsed = musterEditSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;
    if (!(await canReachEmployee(actor, v.employeeId))) throw new Forbidden("That employee is outside your team.");

    const emp = await prisma.employee.findFirst({ where: { id: v.employeeId, deletedAt: null }, select: { fullName: true, joiningDate: true, exitDate: true } });
    if (!emp) return fail("Employee not found.");
    const block = editBlock(v.date, dbToYmd(emp.joiningDate), emp.exitDate ? dbToYmd(emp.exitDate) : null);
    if (block) return fail(block);

    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: v.employeeId, date: ymdToDb(v.date) } } });
    const before = existing ? snapshot(existing, v.date) : null;
    const after: Snapshot = {
      punchIn: v.punchIn || null,
      punchOut: v.punchOut || null,
      statusOverride: v.status === "AUTO" ? null : v.status,
      remarks: v.remarks || null,
      source: "MANUAL",
    };
    if (sameEdit(before, after)) return fail("Nothing changed.");

    const data = {
      punchInAt: after.punchIn ? istAt(v.date, after.punchIn) : null,
      punchOutAt: after.punchOut ? istAt(v.date, after.punchOut) : null,
      statusOverride: after.statusOverride,
      remarks: after.remarks,
      source: "MANUAL" as const,
    };
    await prisma.$transaction(async (tx) => {
      const rec = await tx.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: v.employeeId, date: ymdToDb(v.date) } },
        create: { employeeId: v.employeeId, date: ymdToDb(v.date), ...data },
        update: data,
      });
      await writeAudit({ actorId: actor.id, action: existing ? "UPDATE" : "CREATE", entity: "AttendanceRecord", entityId: rec.id, before, after, reason: v.reason }, tx);
    });
    await recomputeDay(v.employeeId, v.date);
    revalidate();
    return { ok: true, message: `Saved ${emp.fullName}, ${formatDate(v.date)}` };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("saveMusterDay failed", err);
    return fail("Could not save the change. Try again.");
  }
}

// ---------------------------------------------------------------------------
// Bulk mark
// ---------------------------------------------------------------------------

export async function bulkMark(input: BulkMarkInput): Promise<{ ok: true; message: string; changed: number; skipped: string[] } | Fail> {
  try {
    const actor = await actionUser("attendance.edit");
    const parsed = bulkMarkSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;
    // "Everyone" means everyone in the actor's reach; hand-picked people must all be in it.
    const reach = await scopeEmployeeIds(actor);
    if (reach && v.scope === "SELECTED" && v.employeeIds.some((id) => !reach.includes(id))) throw new Forbidden("Some of the selected people are outside your team.");
    if (v.date > istDate()) return fail("Upcoming days can't be marked.", "date");

    const day = ymdToDb(v.date);
    const employed = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        joiningDate: { lte: day },
        OR: [{ exitDate: null }, { exitDate: { gte: day } }],
        ...(v.scope === "SELECTED" ? { id: { in: v.employeeIds } } : reach ? { id: { in: reach } } : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
    const skipped: string[] = [];
    if (v.scope === "SELECTED" && employed.length < v.employeeIds.length) {
      const ok = new Set(employed.map((e) => e.id));
      const others = await prisma.employee.findMany({ where: { id: { in: v.employeeIds.filter((id) => !ok.has(id)) } }, select: { fullName: true } });
      skipped.push(...others.map((e) => `${e.fullName} (not employed that day)`));
    }
    if (!employed.length) return fail("No one selected was employed on that date.", "employeeIds");

    const ids = employed.map((e) => e.id);
    const ctx = await loadContext(ids, v.date, v.date);
    const records = new Map((await prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, date: day } })).map((r) => [r.employeeId, r]));

    type Plan = { id: number; existing: AttendanceRecord | null; before: Snapshot | null; after: Snapshot };
    const plans: Plan[] = [];
    let unchanged = 0;
    for (const e of employed) {
      const existing = records.get(e.id) ?? null;
      const before = existing ? snapshot(existing, v.date) : null;
      let after: Snapshot;
      if (v.action === "PRESENT_SHIFT") {
        const shift = shiftFor(ctx, e.id, v.date);
        const timing = shift?.days.find((x) => x.weekday === weekdayOf(v.date));
        if (!timing) {
          skipped.push(`${e.fullName} (no shift timing that day)`);
          continue;
        }
        // Punches that exist are kept; only the missing ones get the shift times.
        after = { punchIn: before?.punchIn ?? timing.startTime, punchOut: before?.punchOut ?? timing.endTime, statusOverride: null, remarks: before?.remarks ?? null, source: "MANUAL" };
      } else {
        after = { punchIn: before?.punchIn ?? null, punchOut: before?.punchOut ?? null, statusOverride: v.action, remarks: before?.remarks ?? null, source: "MANUAL" };
      }
      if (sameEdit(before, after)) {
        unchanged++;
        continue;
      }
      plans.push({ id: e.id, existing, before, after });
    }

    if (plans.length) {
      await prisma.$transaction(
        async (tx) => {
          for (const p of plans) {
            const data = {
              punchInAt: p.after.punchIn ? istAt(v.date, p.after.punchIn) : null,
              punchOutAt: p.after.punchOut ? istAt(v.date, p.after.punchOut) : null,
              statusOverride: p.after.statusOverride,
              source: "MANUAL" as const,
            };
            const rec = await tx.attendanceRecord.upsert({
              where: { employeeId_date: { employeeId: p.id, date: day } },
              create: { employeeId: p.id, date: day, ...data },
              update: data,
            });
            await writeAudit({ actorId: actor.id, action: "BULK_MARK", entity: "AttendanceRecord", entityId: rec.id, before: p.before, after: p.after, reason: v.reason }, tx);
          }
        },
        { timeout: 30_000 },
      );
      for (const p of plans) await recomputeDay(p.id, v.date);
      revalidate();
    }

    const what = v.action === "PRESENT_SHIFT" ? "present with shift times" : STATUS_META[v.action].label.toLowerCase();
    const parts = [`${plans.length} ${plans.length === 1 ? "person" : "people"} marked ${what} on ${formatDate(v.date)}`];
    if (unchanged) parts.push(`${unchanged} already set`);
    if (skipped.length) parts.push(`${skipped.length} skipped`);
    return { ok: true, message: parts.join(" · "), changed: plans.length, skipped };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("bulkMark failed", err);
    return fail("Could not mark attendance. Nothing was changed.");
  }
}
