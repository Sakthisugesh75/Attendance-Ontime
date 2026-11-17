"use server";

import { randomBytes } from "node:crypto";
import { loadAllocation } from "@/lib/leave-allocation";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeRange } from "@/lib/attendance/service";
import { writeAudit } from "@/lib/audit";
import { recipientsFor } from "@/lib/access/recipients";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requestDetail, requestFormOptions, requestSummary, validateNewRequest, type RequestDetail, type RequestFormOptions } from "@/lib/requests";
import { actionUser, canReachEmployee, Forbidden, hasPermission, type SessionUser } from "@/lib/session";
import { dbToYmd, istDate, ymdToDb } from "@/lib/time";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  checkRegularization,
  decisionSchema,
  enteredNoticeTitle,
  fmtDays,
  normalizeRequest,
  REQUEST_TYPE_META,
  regularizedPunches,
  requestSchema,
  sniffAttachment,
  type DecisionInput,
  type NormalizedRequest,
} from "@/lib/validations/requests";

export type RequestResult = { ok: true; id: number; message: string; warning?: string } | { ok: false; error: string; field?: string };
export type DecisionResult = { ok: true; message: string; failed: { id: number; error: string }[] } | { ok: false; error: string };

const STORAGE = path.join(process.cwd(), "storage");
const fail = (error: string, field?: string) => ({ ok: false as const, error, field });

function revalidate() {
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
}

// ---- Shared: read and store a new request -----------------------------------

type Submission = { v: NormalizedRequest; days: number | null; warning?: string; attachment: { bytes: Uint8Array; kind: "pdf" | "jpg" | "png" } | null };

/**
 * Parses FormData (`payload` = JSON matching requestSchema, optional `attachment` for leave)
 * and runs every business rule for `employeeId`. `who` = the employee's name when HR enters it.
 */
async function readSubmission(form: FormData, employeeId: number, who?: string): Promise<{ ok: true; s: Submission } | ReturnType<typeof fail>> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return fail("The form was incomplete. Try again.");
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
  const v = normalizeRequest(parsed.data);

  const check = await validateNewRequest(employeeId, v, who);
  if (!check.ok) return fail(check.error, check.field);

  // Attachment (leave only): PDF / JPG / PNG up to 5 MB, verified by content.
  const file = form.get("attachment");
  let attachment: Submission["attachment"] = null;
  if (file instanceof File && file.size > 0) {
    if (v.type !== "LEAVE") return fail("Attachments are only for leave requests.", "attachment");
    if (file.size > ATTACHMENT_MAX_BYTES) return fail("The attachment must be 5 MB or smaller.", "attachment");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffAttachment(bytes);
    if (!kind || !ATTACHMENT_TYPES[file.type]) return fail("Attach a PDF, JPG or PNG file.", "attachment");
    attachment = { bytes, kind };
  }
  return { ok: true, s: { v, days: check.days, warning: check.warning, attachment } };
}

async function storeAttachment(employeeId: number, a: NonNullable<Submission["attachment"]>): Promise<string> {
  const rel = `attachments/${employeeId}-${Date.now()}-${randomBytes(4).toString("hex")}.${a.kind}`;
  await mkdir(path.join(STORAGE, "attachments"), { recursive: true });
  await writeFile(path.join(STORAGE, rel), a.bytes);
  return rel;
}

const decideInclude = { leaveType: true, employee: { select: { userId: true, fullName: true } } } satisfies Prisma.AttendanceRequestInclude;
type DecidableRequest = Prisma.AttendanceRequestGetPayload<{ include: typeof decideInclude }>;

/** Inserts a PENDING request (and its CREATE audit row) inside the caller's transaction. */
async function insertRequest(
  tx: Prisma.TransactionClient,
  p: { actorId: number; employeeId: number; s: Submission; attachmentPath: string | null; enteredById: number | null },
): Promise<DecidableRequest> {
  const { v, days } = p.s;
  const r = await tx.attendanceRequest.create({
    data: {
      employeeId: p.employeeId,
      type: v.type,
      leaveTypeId: v.leaveTypeId,
      fromDate: ymdToDb(v.fromDate),
      toDate: ymdToDb(v.toDate),
      halfDay: v.halfDay,
      startTime: v.startTime,
      endTime: v.endTime,
      days: days === null ? null : new Prisma.Decimal(days),
      reason: v.reason,
      attachmentPath: p.attachmentPath,
      enteredById: p.enteredById,
    },
    include: decideInclude,
  });
  await writeAudit(
    {
      actorId: p.actorId,
      action: "CREATE",
      entity: "AttendanceRequest",
      entityId: r.id,
      after: { ...v, days, attachment: !!p.attachmentPath, ...(p.enteredById && { enteredFor: p.employeeId }) },
    },
    tx,
  );
  return r;
}

/** Tells everyone who may approve requests for the employee (never `exceptUserId`) about a new request. */
async function notifyApprovers(r: DecidableRequest, s: Submission, exceptUserId: number, enteredBy?: string) {
  const summary = requestSummary({ ...s.v, days: s.days, leaveType: r.leaveType });
  const approvers = (await recipientsFor("requests.approve", r.employeeId)).filter((id) => id !== exceptUserId);
  const label = REQUEST_TYPE_META[s.v.type].label.toLowerCase();
  await notifyUsers(approvers, {
    title: enteredBy ? `New ${label} request for ${r.employee.fullName} (entered by ${enteredBy})` : `New ${label} request from ${r.employee.fullName}`,
    body: `${summary}\nReason: ${s.v.reason}`,
    link: `/requests?view=approvals&id=${r.id}`,
  }).catch((e) => console.error("notify failed", e));
}

// ---- Employee: submit -------------------------------------------------------

/**
 * Submits a request. FormData carries `payload` (JSON matching requestSchema) and an
 * optional `attachment` (leave only). Days, balance, caps and clashes are all re-checked here.
 */
export async function createRequest(form: FormData): Promise<RequestResult> {
  let savedFile: string | null = null;
  try {
    const actor = await actionUser();
    if (!actor.employeeId) return fail("Your sign-in isn't linked to an employee record.");
    const employeeId = actor.employeeId;
    const read = await readSubmission(form, employeeId);
    if (!read.ok) return read;
    const { s } = read;

    const attachmentPath = s.attachment ? await storeAttachment(employeeId, s.attachment) : null;
    savedFile = attachmentPath;
    const created = await prisma.$transaction((tx) => insertRequest(tx, { actorId: actor.id, employeeId, s, attachmentPath, enteredById: null }));
    savedFile = null;

    await notifyApprovers(created, s, actor.id);
    revalidate();
    return { ok: true, id: created.id, message: "Request sent for approval", warning: s.warning };
  } catch (err) {
    if (savedFile) await unlink(path.join(STORAGE, savedFile)).catch(() => {});
    if (err instanceof Forbidden) return fail(err.message);
    console.error("createRequest failed", err);
    return fail("Could not send the request. Try again.");
  }
}

// ---- HR / manager: record on an employee's behalf ----------------------------

const entrySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  approve: z.enum(["0", "1"]).default("1"),
});

/** Who HR may enter requests for: someone else, in reach, with a live employee record. */
async function entryTarget(actor: SessionUser, employeeId: number) {
  if (employeeId === actor.employeeId) throw new Forbidden("That's you. Use New request for your own requests.");
  if (!(await canReachEmployee(actor, employeeId))) throw new Forbidden("That employee is outside your team.");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, fullName: true, code: true, userId: true } });
  if (!employee) throw new Forbidden("That employee wasn't found.");
  if (employee.userId === actor.id) throw new Forbidden("That's you. Use New request for your own requests.");
  return employee;
}

/**
 * HR / a manager records a request for an employee who asked in person ("I'll leave at 4 for
 * an hour"). FormData: `employeeId`, `approve` ("1" = approve now, the default; "0" = leave it
 * pending), plus `payload` and optional `attachment` exactly as createRequest. The same rules
 * run for that employee; approving goes through the same decision path as the approvals inbox.
 */
export async function createRequestForEmployee(form: FormData): Promise<RequestResult> {
  let savedFile: string | null = null;
  try {
    const actor = await actionUser("requests.approve");
    const entry = entrySchema.safeParse({ employeeId: form.get("employeeId"), approve: form.get("approve") ?? undefined });
    if (!entry.success) return fail("Pick an employee.", "employeeId");
    const employee = await entryTarget(actor, entry.data.employeeId);
    const approve = entry.data.approve === "1";

    const read = await readSubmission(form, employee.id, employee.fullName);
    if (!read.ok) return read;
    const { s } = read;

    const attachmentPath = s.attachment ? await storeAttachment(employee.id, s.attachment) : null;
    savedFile = attachmentPath;
    const { created, decided } = await prisma.$transaction(async (tx) => {
      const created = await insertRequest(tx, { actorId: actor.id, employeeId: employee.id, s, attachmentPath, enteredById: actor.id });
      const decided = approve ? await applyDecision(tx, actor, created, "APPROVE", "") : null;
      return { created, decided };
    });
    savedFile = null;

    const summary = requestSummary({ ...s.v, days: s.days, leaveType: created.leaveType });
    const notice = { title: enteredNoticeTitle(s.v.type, approve), body: `${summary}\nReason: ${s.v.reason}\nEntered by ${actor.name}`, link: "/requests" };
    if (decided) await settle(decided, notice);
    else {
      if (employee.userId) await notifyUsers([employee.userId], notice).catch((e) => console.error("notify failed", e));
      await notifyApprovers(created, s, actor.id, actor.name);
    }
    revalidate();
    const label = REQUEST_TYPE_META[s.v.type].label;
    return {
      ok: true,
      id: created.id,
      message: approve ? `${label} recorded and approved for ${employee.fullName}` : `${label} request recorded for ${employee.fullName}`,
      warning: s.warning,
    };
  } catch (err) {
    if (savedFile) await unlink(path.join(STORAGE, savedFile)).catch(() => {});
    if (err instanceof Forbidden || err instanceof DecisionError) return fail(err.message);
    console.error("createRequestForEmployee failed", err);
    return fail("Could not record the request. Try again.");
  }
}

/** The "New request" form figures (balances, caps used, punches, clashes) for another employee. */
export async function loadEntryOptions(
  employeeId: number,
): Promise<{ ok: true; options: RequestFormOptions; employee: { id: number; name: string; code: string } } | { ok: false; error: string }> {
  try {
    const actor = await actionUser("requests.approve");
    z.number().int().positive().parse(employeeId);
    const employee = await entryTarget(actor, employeeId);
    const options = await requestFormOptions(employee.id);
    if (!options) return { ok: false, error: "That employee wasn't found." };
    return { ok: true, options, employee: { id: employee.id, name: employee.fullName, code: employee.code } };
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: err.message };
    console.error("loadEntryOptions failed", err);
    return { ok: false, error: "Could not load that employee." };
  }
}

// ---- Employee: cancel -------------------------------------------------------

async function ownRequest(actor: SessionUser, id: number) {
  z.number().int().positive().parse(id);
  const r = await prisma.attendanceRequest.findUnique({ where: { id } });
  if (!r || !actor.employeeId || r.employeeId !== actor.employeeId) throw new Forbidden("That request isn't yours.");
  return r;
}

/** Withdraws a request that is still waiting for a decision. */
export async function cancelRequest(id: number): Promise<RequestResult> {
  try {
    const actor = await actionUser();
    const r = await ownRequest(actor, id);
    if (r.status !== "PENDING") return fail("Only a pending request can be withdrawn.");
    await prisma.$transaction(async (tx) => {
      const res = await tx.attendanceRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
      if (res.count !== 1) throw new Forbidden("This request was decided in the meantime. Refresh the page.");
      await writeAudit({ actorId: actor.id, action: "CANCEL", entity: "AttendanceRequest", entityId: id, before: { status: "PENDING" }, after: { status: "CANCELLED" } }, tx);
    });
    revalidate();
    return { ok: true, id, message: "Request withdrawn" };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("cancelRequest failed", err);
    return fail("Could not withdraw the request. Try again.");
  }
}

/** Asks HR to cancel an approved request. It stays in force until HR approves the cancellation. */
export async function requestCancellation(id: number, reason: string): Promise<RequestResult> {
  try {
    const actor = await actionUser();
    const parsedReason = z.string().trim().min(3, "Say why (at least 3 characters)").max(500).safeParse(reason);
    if (!parsedReason.success) return fail(parsedReason.error.issues[0]!.message, "reason");
    const r = await ownRequest(actor, id);
    if (r.status !== "APPROVED") return fail("Only an approved request can be cancelled this way.");
    if (r.type === "REGULARIZATION") return fail("An approved regularization has already corrected the day. Ask HR to change it.");

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.attendanceRequest.updateMany({ where: { id, status: "APPROVED" }, data: { status: "CANCEL_REQUESTED" } });
      if (res.count !== 1) throw new Forbidden("This request changed in the meantime. Refresh the page.");
      await writeAudit({ actorId: actor.id, action: "CANCEL_REQUEST", entity: "AttendanceRequest", entityId: id, before: { status: "APPROVED" }, after: { status: "CANCEL_REQUESTED" }, reason: parsedReason.data }, tx);
      return tx.attendanceRequest.findUniqueOrThrow({ where: { id }, include: { leaveType: true, employee: { select: { fullName: true } } } });
    });

    const approvers = (await recipientsFor("requests.approve", r.employeeId)).filter((u) => u !== actor.id);
    await notifyUsers(approvers, {
      title: `${updated.employee.fullName} wants to cancel an approved request`,
      body: `${requestSummary({ type: updated.type, fromDate: dbToYmd(updated.fromDate), toDate: dbToYmd(updated.toDate), days: updated.days === null ? null : Number(updated.days), leaveType: updated.leaveType })}\nReason: ${parsedReason.data}`,
      link: `/requests?view=approvals&id=${id}`,
    }).catch((e) => console.error("notify failed", e));
    revalidate();
    return { ok: true, id, message: "Cancellation sent to HR" };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("requestCancellation failed", err);
    return fail("Could not send the cancellation. Try again.");
  }
}

// ---- Approver: decide -------------------------------------------------------

class DecisionError extends Error {}

type Decided = { employeeId: number; userId: number | null; from: string; to: string; title: string; body: string };

async function decideOne(actor: SessionUser, id: number, decision: "APPROVE" | "REJECT", comment: string): Promise<Decided> {
  const r = await prisma.attendanceRequest.findUnique({ where: { id }, include: decideInclude });
  if (!r) throw new DecisionError("This request no longer exists.");
  // Approvers decide only for people in their reach, and never their own request (unless Super Admin).
  if (!(await canReachEmployee(actor, r.employeeId))) throw new DecisionError("That request is outside your team.");
  if (r.employee.userId === actor.id && !actor.isSuperAdmin) throw new DecisionError("You can't decide your own request.");
  if (r.status !== "PENDING" && r.status !== "CANCEL_REQUESTED") throw new DecisionError("Already decided.");
  if (decision === "REJECT" && comment.length < 3) throw new DecisionError("Add a comment saying why it's rejected.");
  return prisma.$transaction((tx) => applyDecision(tx, actor, r, decision, comment));
}

/**
 * The decision itself, inside the caller's transaction: status (guarded against a second
 * approver), leave balance, regularized punches and the audit rows. Shared by the approvals
 * inbox and by HR recording a request that is approved on the spot.
 */
async function applyDecision(tx: Prisma.TransactionClient, actor: SessionUser, r: DecidableRequest, decision: "APPROVE" | "REJECT", comment: string): Promise<Decided> {
  const id = r.id;
  const from = dbToYmd(r.fromDate);
  const to = dbToYmd(r.toDate);
  const days = r.days === null ? 0 : Number(r.days);
  const year = Number(from.slice(0, 4));
  const cancelling = r.status === "CANCEL_REQUESTED";
  const next = cancelling ? (decision === "APPROVE" ? "CANCELLED" : "APPROVED") : decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const summary = requestSummary({ type: r.type, fromDate: from, toDate: to, days: r.days === null ? null : days, leaveType: r.leaveType, startTime: r.startTime, endTime: r.endTime });

  // Guard against two approvers deciding at once.
  const res = await tx.attendanceRequest.updateMany({
    where: { id, status: r.status },
    data: { status: next, approverId: actor.id, decidedAt: new Date(), decisionComment: comment || null },
  });
  if (res.count !== 1) throw new DecisionError("Someone else decided this request in the meantime.");

  if (r.type === "LEAVE" && r.leaveTypeId && days > 0) {
    if (!cancelling && decision === "APPROVE") {
      // Stored balance, or the planned one (custom quota + carry forward) if this year has none yet.
      const alloc = await loadAllocation(tx, [r.employeeId], year);
      const bal = alloc.figures(r.employeeId, r.leaveTypeId);
      const left = bal.allotted + bal.carriedForward - bal.used;
      if (r.leaveType!.isPaid && days > left + 1e-9) throw new DecisionError(`Not enough ${r.leaveType!.name} left (${fmtDays(Math.max(left, 0))}).`);
      await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year } },
        create: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year, allotted: bal.allotted, carriedForward: bal.carriedForward, used: days },
        update: { used: { increment: days } },
      });
    } else if (cancelling && decision === "APPROVE") {
      await tx.leaveBalance.updateMany({
        where: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year },
        data: { used: { decrement: days } },
      });
    }
  }

  if (r.type === "REGULARIZATION" && !cancelling && decision === "APPROVE") {
    const record = await tx.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: r.employeeId, date: r.fromDate } } });
    const v = { fromDate: from, startTime: r.startTime, endTime: r.endTime };
    const error = checkRegularization(record, v);
    if (error) throw new DecisionError(error);
    const punches = regularizedPunches(record, v);
    const after = await tx.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: r.employeeId, date: r.fromDate } },
      create: { employeeId: r.employeeId, date: r.fromDate, ...punches, source: "MANUAL", remarks: r.reason.slice(0, 500) },
      update: { ...punches, source: "MANUAL", remarks: r.reason.slice(0, 500) },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: "REGULARIZE",
        entity: "AttendanceRecord",
        entityId: after.id,
        before: record ? { punchInAt: record.punchInAt, punchOutAt: record.punchOutAt, source: record.source, remarks: record.remarks } : null,
        after: { punchInAt: after.punchInAt, punchOutAt: after.punchOutAt, source: after.source, requestId: id },
        reason: r.reason.slice(0, 500),
      },
      tx,
    );
  }

  await writeAudit(
    {
      actorId: actor.id,
      action: cancelling ? (decision === "APPROVE" ? "APPROVE_CANCEL" : "REJECT_CANCEL") : decision,
      entity: "AttendanceRequest",
      entityId: id,
      before: { status: r.status },
      after: { status: next, days: r.type === "LEAVE" ? days : undefined },
      reason: comment || null,
    },
    tx,
  );

  const label = REQUEST_TYPE_META[r.type].label;
  const title = cancelling
    ? decision === "APPROVE"
      ? `Cancellation approved: ${label.toLowerCase()}`
      : `Cancellation declined: ${label.toLowerCase()} stays approved`
    : `${label} request ${decision === "APPROVE" ? "approved" : "rejected"}`;
  return { employeeId: r.employeeId, userId: r.employee.userId, from, to, title, body: comment ? `${summary}\nComment: ${comment}` : summary };
}

/** After commit: the stored day statuses up to today, and the employee's bell (default: the decision). */
async function settle(d: Decided, message?: { title: string; body: string; link: string }) {
  const today = istDate();
  await recomputeRange(d.employeeId, d.from, d.to < today ? d.to : today).catch((e) => console.error("recompute failed", e));
  if (d.userId) await notifyUsers([d.userId], message ?? { title: d.title, body: d.body, link: "/requests" }).catch((e) => console.error("notify failed", e));
}

/** Approve or reject one or more requests (bulk approve uses the same path). Each runs in its own transaction. */
export async function decideRequests(input: DecisionInput): Promise<DecisionResult> {
  try {
    const actor = await actionUser("requests.approve");
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const { ids, decision, comment } = parsed.data;

    const done: Decided[] = [];
    const failed: { id: number; error: string }[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        done.push(await decideOne(actor, id, decision, comment));
      } catch (err) {
        if (err instanceof DecisionError) failed.push({ id, error: err.message });
        else {
          console.error("decideOne failed", id, err);
          failed.push({ id, error: "Could not save the decision." });
        }
      }
    }

    for (const d of done) await settle(d);
    revalidate();

    if (!done.length) return { ok: false, error: failed[0]?.error ?? "Nothing was decided." };
    const verb = decision === "APPROVE" ? "Approved" : "Rejected";
    return { ok: true, message: done.length === 1 ? verb : `${verb} ${done.length} requests`, failed };
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: err.message };
    console.error("decideRequests failed", err);
    return { ok: false, error: "Could not save the decision. Try again." };
  }
}

// ---- Read: detail for the drawer --------------------------------------------

export async function loadRequestDetail(id: number): Promise<{ ok: true; detail: RequestDetail } | { ok: false; error: string }> {
  try {
    const actor = await actionUser();
    z.number().int().positive().parse(id);
    const detail = await requestDetail(id);
    if (!detail) return { ok: false, error: "This request no longer exists." };
    const own = detail.request.employee.id === actor.employeeId;
    if (!own && !(hasPermission(actor, "requests.approve") && (await canReachEmployee(actor, detail.request.employee.id)))) throw new Forbidden();
    return { ok: true, detail };
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: err.message };
    console.error("loadRequestDetail failed", err);
    return { ok: false, error: "Could not load the request." };
  }
}
