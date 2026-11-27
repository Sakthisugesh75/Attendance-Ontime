"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { loadAllocation } from "@/lib/leave-allocation";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeRange } from "@/lib/attendance/service";
import { ruleInForce, type WeeklyOffPattern } from "@/lib/attendance/weekly-off";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden } from "@/lib/session";
import { getSetting, setSetting } from "@/lib/settings";
import { addDays, dbToYmd, formatDate, istDate, ymdToDb } from "@/lib/time";
import {
  allocateYearSchema,
  buildPattern,
  capsSchema,
  companyFormSchema,
  customDateSchema,
  describePattern,
  LOGO_TYPES,
  leaveTypeSchema,
  lookupKindSchema,
  lookupNameSchema,
  MAX_LOGO_BYTES,
  punchingFormSchema,
  quotaRuleSchema,
  shiftSchema,
  weeklyOffSchema,
  groupWeeklyOffSchema,
  type GroupWeeklyOffInput,
  exportFormatSchema,
  type ExportFormat,
  type CapsFormInput,
  type CompanyFormInput,
  type CustomDateInput,
  type LeaveTypeInput,
  type LookupKind,
  type PunchingFormInput,
  type ShiftInput,
  type WeeklyOffInput,
} from "@/lib/validations/settings";
import { reportFormSchema, type ReportFormInput } from "@/lib/validations/report-forms";
import type { QuotaRuleInput } from "@/lib/validations/settings";

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string; field?: string };

const STORAGE = path.join(process.cwd(), "storage");
/** Recomputing further back than this is refused work, not history: older months stay as stored. */
const MAX_RECOMPUTE_DAYS = 400;

const ok = (message: string): SettingsResult => ({ ok: true, message });
const fail = (error: string, field?: string): SettingsResult => ({ ok: false, error, field });
const zodFail = (err: z.ZodError) => fail(err.issues[0]!.message, err.issues[0]!.path.join("."));

/** Shared error handling: Forbidden becomes a message, anything unexpected is logged. */
async function guarded(name: string, run: () => Promise<SettingsResult>): Promise<SettingsResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("That name is already in use.", "name");
    console.error(`${name} failed`, err);
    return fail("Could not save. Try again.");
  }
}

function revalidateSettings() {
  revalidatePath("/settings");
}

/**
 * Re-stores computed statuses for employees affected by a change to shifts or weekly offs.
 * Only past days are rewritten (recomputeRange stops at yesterday) and never more than 400 days back.
 */
async function recomputeEmployees(from: string, to: string, scope: { shiftId?: number; includeUnassigned?: boolean; departmentId?: number; designationId?: number } = {}) {
  const today = istDate();
  const floor = addDays(today, -MAX_RECOMPUTE_DAYS);
  const start = from < floor ? floor : from;
  const end = to < today ? to : addDays(today, -1);
  if (start > end) return;

  const shiftFilter: Prisma.EmployeeWhereInput[] = [];
  if (scope.shiftId !== undefined) {
    shiftFilter.push({ shifts: { some: { shiftId: scope.shiftId, effectiveFrom: { lte: ymdToDb(end) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: ymdToDb(start) } }] } } });
    if (scope.includeUnassigned) shiftFilter.push({ shifts: { none: {} } });
  }
  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      ...(scope.departmentId !== undefined && { departmentId: scope.departmentId }),
      ...(scope.designationId !== undefined && { designationId: scope.designationId }),
      joiningDate: { lte: ymdToDb(end) },
      AND: [{ OR: [{ exitDate: null }, { exitDate: { gte: ymdToDb(start) } }] }, ...(shiftFilter.length ? [{ OR: shiftFilter }] : [])],
    },
    select: { id: true, joiningDate: true },
  });
  for (const e of employees) {
    const joined = dbToYmd(e.joiningDate);
    await recomputeRange(e.id, joined > start ? joined : start, end);
  }
}

// ---- Company ----------------------------------------------------------------------

export async function saveCompany(input: CompanyFormInput): Promise<SettingsResult> {
  return guarded("saveCompany", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = companyFormSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const before = await getSetting("company");
    const after = { ...before, ...parsed.data };
    await setSetting("company", after);
    await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "Setting", entityId: "company", before, after });
    revalidatePath("/", "layout");
    return ok("Company details saved");
  });
}

/** Checks the first bytes so a renamed file can't pass as an image. */
function looksLikeImage(buf: Buffer, ext: string) {
  if (ext === "png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === "jpg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === "webp") return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export async function uploadLogo(form: FormData): Promise<SettingsResult> {
  return guarded("uploadLogo", async () => {
    const actor = await actionUser("settings.manage");
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) return fail("Choose an image.", "logo");
    const ext = LOGO_TYPES[file.type];
    if (!ext) return fail("Use a PNG, JPG or WebP image.", "logo");
    if (file.size > MAX_LOGO_BYTES) return fail("The logo must be 1 MB or smaller.", "logo");
    const buf = Buffer.from(await file.arrayBuffer());
    if (!looksLikeImage(buf, ext)) return fail("That file isn't a valid image.", "logo");

    const rel = `logos/logo-${Date.now()}.${ext}`;
    await mkdir(path.join(STORAGE, "logos"), { recursive: true });
    await writeFile(path.join(STORAGE, rel), buf);
    const before = await getSetting("company");
    await setSetting("company", { ...before, logoPath: rel });
    if (before.logoPath) await unlink(path.join(STORAGE, before.logoPath)).catch(() => {});
    await writeAudit({ actorId: actor.id, action: "LOGO", entity: "Setting", entityId: "company", before: { logoPath: before.logoPath }, after: { logoPath: rel } });
    revalidatePath("/", "layout");
    return ok("Logo updated");
  });
}

export async function removeLogo(): Promise<SettingsResult> {
  return guarded("removeLogo", async () => {
    const actor = await actionUser("settings.manage");
    const before = await getSetting("company");
    if (!before.logoPath) return ok("No logo to remove");
    await setSetting("company", { ...before, logoPath: null });
    await unlink(path.join(STORAGE, before.logoPath)).catch(() => {});
    await writeAudit({ actorId: actor.id, action: "LOGO", entity: "Setting", entityId: "company", before: { logoPath: before.logoPath }, after: { logoPath: null } });
    revalidatePath("/", "layout");
    return ok("Logo removed");
  });
}

// ---- Policies & punching ----------------------------------------------------------

export async function saveCaps(input: CapsFormInput): Promise<SettingsResult> {
  return guarded("saveCaps", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = capsSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const before = await getSetting("caps");
    await setSetting("caps", parsed.data);
    await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "Setting", entityId: "caps", before, after: parsed.data });
    revalidateSettings();
    return ok("Policies saved");
  });
}

export async function saveExportFormat(input: ExportFormat): Promise<SettingsResult> {
  return guarded("saveExportFormat", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = exportFormatSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const before = await getSetting("exportFormat");
    await setSetting("exportFormat", parsed.data);
    await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "Setting", entityId: "exportFormat", before, after: parsed.data });
    revalidateSettings();
    return ok("Export format saved");
  });
}

export async function savePunching(input: PunchingFormInput): Promise<SettingsResult> {
  return guarded("savePunching", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = punchingFormSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const [geofence, punch] = await Promise.all([getSetting("geofence"), getSetting("punch")]);
    await setSetting("geofence", parsed.data.geofence);
    await setSetting("punch", parsed.data.punch);
    await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "Setting", entityId: "geofence,punch", before: { geofence, punch }, after: parsed.data });
    revalidateSettings();
    revalidatePath("/dashboard");
    return ok("Punching rules saved");
  });
}

// ---- Weekly offs ------------------------------------------------------------------

/** Company-wide rules only (not tied to a shift, department or designation). */
const COMPANY_RULE = { shiftId: null, departmentId: null, designationId: null };

async function companyRules() {
  const rows = await prisma.weeklyOffRule.findMany({ where: COMPANY_RULE, orderBy: { effectiveFrom: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    shiftId: null,
    effectiveFrom: dbToYmd(r.effectiveFrom),
    pattern: r.pattern as WeeklyOffPattern,
    customOffDates: (r.customOffDates as string[] | null) ?? [],
    customWorkDates: (r.customWorkDates as string[] | null) ?? [],
    label: r.label,
  }));
}

/** Starts a new weekly-off policy on a date. Earlier rules are never edited, so past months keep their offs. */
export async function scheduleWeeklyOff(input: WeeklyOffInput): Promise<SettingsResult> {
  return guarded("scheduleWeeklyOff", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = weeklyOffSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { saturday, sundayOff, effectiveFrom } = parsed.data;
    const today = istDate();
    if (effectiveFrom < addDays(today, -MAX_RECOMPUTE_DAYS)) return fail("The start date can be at most 400 days back.", "effectiveFrom");

    const pattern = buildPattern(saturday, sundayOff);
    const label = describePattern(pattern);
    const rules = await companyRules();
    const previous = ruleInForce(rules.filter((r) => r.effectiveFrom < effectiveFrom), effectiveFrom, null);
    const sameDay = rules.find((r) => r.effectiveFrom === effectiveFrom);
    const next = rules.find((r) => r.effectiveFrom > effectiveFrom);
    if (sameDay && sameDay.effectiveFrom <= today) return fail("A policy already starts on this date. Pick a later date.", "effectiveFrom");
    const base = sameDay ?? previous;
    if (base && JSON.stringify(buildPattern(saturday, sundayOff)) === JSON.stringify(normalise(base.pattern))) {
      return fail(`${label} is already the policy on ${formatDate(effectiveFrom)}.`, "saturday");
    }

    // Custom dates already planned for the period the new rule takes over move with it.
    const inPeriod = (d: string) => d >= effectiveFrom && (!next || d < next.effectiveFrom);
    const customOffDates = (base?.customOffDates ?? []).filter(inPeriod);
    const customWorkDates = (base?.customWorkDates ?? []).filter(inPeriod);

    const data = { pattern, label, customOffDates, customWorkDates };
    const saved = sameDay
      ? await prisma.weeklyOffRule.update({ where: { id: sameDay.id }, data })
      : await prisma.weeklyOffRule.create({ data: { ...data, effectiveFrom: ymdToDb(effectiveFrom) } });
    await writeAudit({
      actorId: actor.id,
      action: sameDay ? "UPDATE" : "CREATE",
      entity: "WeeklyOffRule",
      entityId: saved.id,
      before: sameDay ? { effectiveFrom, pattern: sameDay.pattern } : previous ? { effectiveFrom: previous.effectiveFrom, pattern: previous.pattern } : undefined,
      after: { effectiveFrom, ...data },
    });

    await recomputeEmployees(effectiveFrom, next ? addDays(next.effectiveFrom, -1) : today);
    revalidateSettings();
    return ok(effectiveFrom > today ? `${label} from ${formatDate(effectiveFrom)}. Scheduled.` : `${label} from ${formatDate(effectiveFrom)}`);
  });
}

/**
 * Starts a weekly-off policy for one department or designation from a date (or, with
 * mode "company", makes that group follow the company policy again from the date).
 * Like the company policy, rules that have started are never edited.
 */
export async function scheduleGroupWeeklyOff(input: GroupWeeklyOffInput): Promise<SettingsResult> {
  return guarded("scheduleGroupWeeklyOff", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = groupWeeklyOffSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { target, targetId, mode, saturday, sundayOff, effectiveFrom } = parsed.data;
    const today = istDate();
    if (effectiveFrom < addDays(today, -MAX_RECOMPUTE_DAYS)) return fail("The start date can be at most 400 days back.", "effectiveFrom");

    const group =
      target === "department"
        ? await prisma.department.findUnique({ where: { id: targetId }, select: { name: true } })
        : await prisma.designation.findUnique({ where: { id: targetId }, select: { name: true } });
    if (!group) return fail(`Pick a ${target}.`, "targetId");
    const where = target === "department" ? { departmentId: targetId, designationId: null } : { designationId: targetId };
    const rows = await prisma.weeklyOffRule.findMany({ where, orderBy: { effectiveFrom: "asc" } });
    const rules = rows.map((r) => ({ ...r, effectiveFrom: dbToYmd(r.effectiveFrom), pattern: r.pattern as WeeklyOffPattern }));
    const sameDay = rules.find((r) => r.effectiveFrom === effectiveFrom);
    const next = rules.find((r) => r.effectiveFrom > effectiveFrom);
    if (sameDay && sameDay.effectiveFrom <= today) return fail("A policy for this group already starts on this date. Pick a later date.", "effectiveFrom");
    const previous = rules.filter((r) => r.effectiveFrom < effectiveFrom).at(-1) ?? null;
    const base = sameDay ?? previous;

    const inherit = mode === "company";
    const pattern: WeeklyOffPattern = inherit ? {} : buildPattern(saturday, sundayOff);
    const label = inherit ? "Company policy" : describePattern(pattern);
    if (inherit && (!base || base.inherit)) return fail(`${group.name} already follows the company policy on ${formatDate(effectiveFrom)}.`, "mode");
    if (!inherit && base && !base.inherit && JSON.stringify(pattern) === JSON.stringify(normalise(base.pattern))) {
      return fail(`${group.name} already has ${label} on ${formatDate(effectiveFrom)}.`, "saturday");
    }

    const data = { pattern: pattern as Prisma.InputJsonValue, label, inherit, customOffDates: [], customWorkDates: [] };
    const saved = sameDay
      ? await prisma.weeklyOffRule.update({ where: { id: sameDay.id }, data })
      : await prisma.weeklyOffRule.create({
          data: { ...data, effectiveFrom: ymdToDb(effectiveFrom), ...(target === "department" ? { departmentId: targetId } : { designationId: targetId }) },
        });
    await writeAudit({
      actorId: actor.id,
      action: sameDay ? "UPDATE" : "CREATE",
      entity: "WeeklyOffRule",
      entityId: saved.id,
      before: base ? { effectiveFrom: base.effectiveFrom, label: base.label } : undefined,
      after: { [target]: group.name, effectiveFrom, label },
    });

    await recomputeEmployees(effectiveFrom, next ? addDays(next.effectiveFrom, -1) : today, target === "department" ? { departmentId: targetId } : { designationId: targetId });
    revalidateSettings();
    const when = effectiveFrom > today ? `from ${formatDate(effectiveFrom)}. Scheduled.` : `from ${formatDate(effectiveFrom)}`;
    return ok(inherit ? `${group.name} follows the company policy ${when}` : `${group.name}: ${label} ${when}`);
  });
}

/** Sorted copy so comparisons don't depend on key or array order. */
function normalise(p: WeeklyOffPattern): WeeklyOffPattern {
  const out: WeeklyOffPattern = {};
  if (p["0"] !== undefined) out["0"] = p["0"];
  for (const k of Object.keys(p).filter((k) => k !== "0" && k !== "6").sort()) out[k] = p[k];
  const sat = p["6"];
  if (sat !== undefined) out["6"] = Array.isArray(sat) ? [...sat].sort((a, b) => a - b) : sat;
  return out;
}

/** Only a rule that hasn't started yet can be withdrawn. */
export async function deleteScheduledRule(id: number): Promise<SettingsResult> {
  return guarded("deleteScheduledRule", async () => {
    const actor = await actionUser("settings.manage");
    z.number().int().positive().parse(id);
    const rule = await prisma.weeklyOffRule.findUnique({ where: { id } });
    if (!rule || rule.shiftId !== null) return fail("This policy no longer exists.");
    if (dbToYmd(rule.effectiveFrom) <= istDate()) return fail("A policy that has already started is kept as history. Schedule a new one instead.");
    await prisma.weeklyOffRule.delete({ where: { id } });
    await writeAudit({ actorId: actor.id, action: "DELETE", entity: "WeeklyOffRule", entityId: id, before: { effectiveFrom: dbToYmd(rule.effectiveFrom), pattern: rule.pattern, label: rule.label } });
    revalidateSettings();
    return ok("Scheduled policy withdrawn");
  });
}

/** Marks one date as an extra off day or an extra working day on the rule in force for that date. */
export async function setCustomDate(input: CustomDateInput): Promise<SettingsResult> {
  return guarded("setCustomDate", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = customDateSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { date, kind } = parsed.data;
    if (date < addDays(istDate(), -MAX_RECOMPUTE_DAYS)) return fail("That date is more than 400 days back.", "date");
    const rule = ruleInForce(await companyRules(), date, null);
    if (!rule) return fail("No weekly-off policy covers that date.", "date");

    const off = new Set(rule.customOffDates);
    const work = new Set(rule.customWorkDates);
    if ((kind === "OFF" ? off : work).has(date)) return fail(`${formatDate(date)} is already a custom ${kind === "OFF" ? "off" : "working"} day.`, "date");
    off.delete(date);
    work.delete(date);
    (kind === "OFF" ? off : work).add(date);
    const after = { customOffDates: [...off].sort(), customWorkDates: [...work].sort() };
    await prisma.weeklyOffRule.update({ where: { id: rule.id }, data: after });
    await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "WeeklyOffRule", entityId: rule.id, before: { customOffDates: rule.customOffDates, customWorkDates: rule.customWorkDates }, after });
    await recomputeEmployees(date, date);
    revalidateSettings();
    return ok(`${formatDate(date)} marked as ${kind === "OFF" ? "an off day" : "a working day"}`);
  });
}

export async function removeCustomDate(date: string): Promise<SettingsResult> {
  return guarded("removeCustomDate", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = customDateSchema.shape.date.safeParse(date);
    if (!parsed.success) return zodFail(parsed.error);
    const rule = ruleInForce(await companyRules(), parsed.data, null);
    if (!rule || (!rule.customOffDates.includes(date) && !rule.customWorkDates.includes(date))) return fail("That custom date no longer exists.");
    const after = { customOffDates: rule.customOffDates.filter((d) => d !== date), customWorkDates: rule.customWorkDates.filter((d) => d !== date) };
    await prisma.weeklyOffRule.update({ where: { id: rule.id }, data: after });
    await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "WeeklyOffRule", entityId: rule.id, before: { customOffDates: rule.customOffDates, customWorkDates: rule.customWorkDates }, after });
    await recomputeEmployees(date, date);
    revalidateSettings();
    return ok(`${formatDate(date)} follows the weekly pattern again`);
  });
}

// ---- Shifts -------------------------------------------------------------------------

type ShiftSnapshot = ReturnType<typeof shiftSnapshot>;
function shiftSnapshot(s: Prisma.ShiftGetPayload<{ include: { days: true } }>) {
  return {
    name: s.name,
    isDefault: s.isDefault,
    graceMinutes: s.graceMinutes,
    fullDayMinutes: s.fullDayMinutes,
    halfDayMinutes: s.halfDayMinutes,
    earlyLeaveMinutes: s.earlyLeaveMinutes,
    overtimeAfterMinutes: s.overtimeAfterMinutes,
    days: [...s.days].sort((a, b) => a.weekday - b.weekday).map((d) => ({ weekday: d.weekday, startTime: d.startTime, endTime: d.endTime, fullDayMinutes: d.fullDayMinutes })),
  };
}
/** Everything except the name and default flag changes computed results. */
const timingKey = (s: ShiftSnapshot) =>
  JSON.stringify([s.graceMinutes, s.fullDayMinutes, s.halfDayMinutes, s.earlyLeaveMinutes, s.overtimeAfterMinutes, s.days]);

export async function saveShift(id: number | null, input: ShiftInput): Promise<SettingsResult> {
  return guarded("saveShift", async () => {
    const actor = await actionUser("settings.manage");
    if (id !== null) z.number().int().positive().parse(id);
    const parsed = shiftSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;

    const before = id ? await prisma.shift.findUnique({ where: { id }, include: { days: true } }) : null;
    if (id && !before) return fail("This shift no longer exists.");
    const count = await prisma.shift.count();
    // Exactly one default: the first shift is it, and the default can only move to another shift.
    const isDefault = v.isDefault || count === 0 || (id !== null && before?.isDefault === true);
    if (before?.isDefault && !v.isDefault) return fail("Make another shift the default instead of switching this one off.", "isDefault");

    const days = v.days.flatMap((d, weekday) =>
      d.enabled ? [{ weekday, startTime: d.startTime, endTime: d.endTime, fullDayMinutes: d.fullDayMinutes === "" ? null : d.fullDayMinutes }] : [],
    );
    const fields = {
      name: v.name,
      isDefault,
      graceMinutes: v.graceMinutes,
      fullDayMinutes: v.fullDayMinutes,
      halfDayMinutes: v.halfDayMinutes,
      earlyLeaveMinutes: v.earlyLeaveMinutes,
      overtimeAfterMinutes: v.overtimeAfterMinutes,
    };

    const saved = await prisma.$transaction(async (tx) => {
      if (isDefault) await tx.shift.updateMany({ where: { isDefault: true, ...(id && { id: { not: id } }) }, data: { isDefault: false } });
      const s = id
        ? await tx.shift.update({ where: { id }, data: { ...fields, days: { deleteMany: {}, create: days } }, include: { days: true } })
        : await tx.shift.create({ data: { ...fields, days: { create: days } }, include: { days: true } });
      await writeAudit({ actorId: actor.id, action: id ? "UPDATE" : "CREATE", entity: "Shift", entityId: s.id, before: before ? shiftSnapshot(before) : undefined, after: shiftSnapshot(s) }, tx);
      return s;
    });

    // Shift timings have no history of their own, so changed timings re-store past days of everyone on the shift.
    const today = istDate();
    const from = addDays(today, -MAX_RECOMPUTE_DAYS);
    const becameDefault = isDefault && !before?.isDefault;
    if (before && timingKey(shiftSnapshot(before)) !== timingKey(shiftSnapshot(saved))) {
      await recomputeEmployees(from, today, { shiftId: saved.id, includeUnassigned: isDefault });
    } else if (becameDefault && count > 0) {
      // Employees without an assignment follow the default shift.
      await recomputeEmployees(from, today, { shiftId: -1, includeUnassigned: true });
    }
    revalidateSettings();
    revalidatePath("/employees");
    return ok(id ? `${saved.name} saved` : `${saved.name} created`);
  });
}

export async function deleteShift(id: number): Promise<SettingsResult> {
  return guarded("deleteShift", async () => {
    const actor = await actionUser("settings.manage");
    z.number().int().positive().parse(id);
    const shift = await prisma.shift.findUnique({ where: { id }, include: { days: true, _count: { select: { assignments: true } } } });
    if (!shift) return fail("This shift no longer exists.");
    if (shift.isDefault) return fail("The default shift can't be deleted. Make another shift the default first.");
    if (shift._count.assignments > 0) {
      return fail(`${shift.name} is assigned to employees (${shift._count.assignments} assignment${shift._count.assignments === 1 ? "" : "s"}, including past ones). Move them to another shift first.`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.shift.delete({ where: { id } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "Shift", entityId: id, before: shiftSnapshot(shift) }, tx);
    });
    revalidateSettings();
    return ok(`${shift.name} deleted`);
  });
}

// ---- Leave types -----------------------------------------------------------------------

const leaveSnapshot = (t: { code: string; name: string; yearlyQuota: Prisma.Decimal | number; isPaid: boolean; carryForward: boolean; maxCarryForward: Prisma.Decimal | number; isActive: boolean }) => ({
  code: t.code,
  name: t.name,
  yearlyQuota: Number(t.yearlyQuota),
  isPaid: t.isPaid,
  carryForward: t.carryForward,
  maxCarryForward: Number(t.maxCarryForward),
  isActive: t.isActive,
});

export async function saveLeaveType(id: number | null, input: LeaveTypeInput): Promise<SettingsResult> {
  return guarded("saveLeaveType", async () => {
    const actor = await actionUser("settings.manage");
    if (id !== null) z.number().int().positive().parse(id);
    const parsed = leaveTypeSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const { designationIds: wanted, ...v } = parsed.data;
    const before = id ? await prisma.leaveType.findUnique({ where: { id }, include: { designations: { select: { designationId: true } } } }) : null;
    if (id && !before) return fail("This leave type no longer exists.");
    const clash = await prisma.leaveType.findFirst({ where: { code: v.code, ...(id && { id: { not: id } }) } });
    if (clash) return fail(`${v.code} is already used by ${clash.name}.`, "code");
    const designationIds = (await prisma.designation.findMany({ where: { id: { in: [...new Set(wanted)] } }, select: { id: true } })).map((d) => d.id);

    const saved = await prisma.$transaction(async (tx) => {
      const t = id ? await tx.leaveType.update({ where: { id }, data: v }) : await tx.leaveType.create({ data: v });
      await tx.leaveTypeDesignation.deleteMany({ where: { leaveTypeId: t.id } });
      if (designationIds.length) await tx.leaveTypeDesignation.createMany({ data: designationIds.map((designationId) => ({ leaveTypeId: t.id, designationId })) });
      await writeAudit(
        {
          actorId: actor.id,
          action: id ? "UPDATE" : "CREATE",
          entity: "LeaveType",
          entityId: t.id,
          before: before ? { ...leaveSnapshot(before), designationIds: before.designations.map((d) => d.designationId) } : undefined,
          after: { ...leaveSnapshot(t), designationIds },
        },
        tx,
      );
      return t;
    });
    revalidateSettings();
    return ok(id ? `${saved.name} saved` : `${saved.name} added`);
  });
}

export async function deleteLeaveType(id: number): Promise<SettingsResult> {
  return guarded("deleteLeaveType", async () => {
    const actor = await actionUser("settings.manage");
    z.number().int().positive().parse(id);
    const t = await prisma.leaveType.findUnique({ where: { id }, include: { _count: { select: { requests: true, balances: true } } } });
    if (!t) return fail("This leave type no longer exists.");
    if (t._count.requests > 0) return fail(`${t.name} has leave requests. Mark it inactive instead so history stays intact.`);
    await prisma.$transaction(async (tx) => {
      await tx.leaveBalance.deleteMany({ where: { leaveTypeId: id } });
      await tx.leaveType.delete({ where: { id } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "LeaveType", entityId: id, before: { ...leaveSnapshot(t), balances: t._count.balances } }, tx);
    });
    revalidateSettings();
    return ok(`${t.name} deleted`);
  });
}

// ---- Custom leave quotas (by designation or person) -----------------------------------------

/**
 * After a quota rule changes: this year's stored balances for the affected employees get the new
 * allotment. Used days and carry forward are kept; years without a stored row follow automatically.
 */
async function refreshAllotments(tx: Prisma.TransactionClient, leaveTypeId: number, where: { designationId?: number; employeeId?: number }) {
  const year = Number(istDate().slice(0, 4));
  const emps = await tx.employee.findMany({ where: { deletedAt: null, ...(where.employeeId ? { id: where.employeeId } : { designationId: where.designationId }) }, select: { id: true } });
  if (!emps.length) return 0;
  const ids = emps.map((e) => e.id);
  const plan = await loadAllocation(tx, ids, year);
  let changed = 0;
  for (const id of ids) {
    const row = plan.stored(id, leaveTypeId, year);
    const quota = plan.quota(id, leaveTypeId).quota;
    if (row && row.allotted !== quota) {
      await tx.leaveBalance.update({ where: { id: row.id }, data: { allotted: quota } });
      changed++;
    }
  }
  return changed;
}

export async function saveQuotaRule(id: number | null, input: QuotaRuleInput): Promise<SettingsResult> {
  return guarded("saveQuotaRule", async () => {
    const actor = await actionUser("settings.manage");
    if (id !== null) z.number().int().positive().parse(id);
    const parsed = quotaRuleSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    const [type, target, before] = await Promise.all([
      prisma.leaveType.findUnique({ where: { id: v.leaveTypeId } }),
      v.employeeId
        ? prisma.employee.findFirst({ where: { id: v.employeeId, deletedAt: null }, select: { fullName: true } }).then((e) => e?.fullName)
        : prisma.designation.findUnique({ where: { id: v.designationId! } }).then((d) => d?.name),
      id ? prisma.leaveQuotaRule.findUnique({ where: { id } }) : null,
    ]);
    if (!type) return fail("This leave type no longer exists.", "leaveTypeId");
    if (!target) return fail(v.employeeId ? "This employee no longer exists." : "This designation no longer exists.", "targetId");
    if (id && !before) return fail("This custom quota no longer exists.");
    const clash = await prisma.leaveQuotaRule.findFirst({ where: { leaveTypeId: v.leaveTypeId, designationId: v.designationId, employeeId: v.employeeId, ...(id && { id: { not: id } }) } });
    if (clash) return fail(`${target} already has a custom ${type.name} quota. Edit that one instead.`, "targetId");

    const changed = await prisma.$transaction(async (tx) => {
      const rule = id ? await tx.leaveQuotaRule.update({ where: { id }, data: v }) : await tx.leaveQuotaRule.create({ data: v });
      let n = await refreshAllotments(tx, v.leaveTypeId, v.employeeId ? { employeeId: v.employeeId } : { designationId: v.designationId! });
      // Moving a rule to someone else: the previous target goes back to its own quota.
      if (before && (before.employeeId !== v.employeeId || before.designationId !== v.designationId || before.leaveTypeId !== v.leaveTypeId)) {
        n += await refreshAllotments(tx, before.leaveTypeId, before.employeeId ? { employeeId: before.employeeId } : { designationId: before.designationId! });
      }
      await writeAudit(
        {
          actorId: actor.id,
          action: id ? "UPDATE" : "CREATE",
          entity: "LeaveQuotaRule",
          entityId: rule.id,
          before: before ? { leaveTypeId: before.leaveTypeId, designationId: before.designationId, employeeId: before.employeeId, yearlyQuota: Number(before.yearlyQuota) } : undefined,
          after: { leaveType: type.code, for: target, yearlyQuota: v.yearlyQuota, balancesUpdated: n },
        },
        tx,
      );
      return n;
    });
    revalidateSettings();
    revalidatePath("/requests");
    return ok(`${target}: ${v.yearlyQuota} ${type.code} a year${changed ? ` (${changed} balance${changed === 1 ? "" : "s"} updated)` : ""}`);
  });
}

export async function deleteQuotaRule(id: number): Promise<SettingsResult> {
  return guarded("deleteQuotaRule", async () => {
    const actor = await actionUser("settings.manage");
    z.number().int().positive().parse(id);
    const rule = await prisma.leaveQuotaRule.findUnique({ where: { id }, include: { leaveType: true, designation: true, employee: { select: { fullName: true } } } });
    if (!rule) return fail("This custom quota no longer exists.");
    const target = rule.employee?.fullName ?? rule.designation?.name ?? "—";
    await prisma.$transaction(async (tx) => {
      await tx.leaveQuotaRule.delete({ where: { id } });
      const n = await refreshAllotments(tx, rule.leaveTypeId, rule.employeeId ? { employeeId: rule.employeeId } : { designationId: rule.designationId! });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "LeaveQuotaRule", entityId: id, before: { leaveType: rule.leaveType.code, for: target, yearlyQuota: Number(rule.yearlyQuota), balancesUpdated: n } }, tx);
    });
    revalidateSettings();
    revalidatePath("/requests");
    return ok(`Custom ${rule.leaveType.code} quota for ${target} removed`);
  });
}

/**
 * Creates or refreshes every active employee's balance for each active leave type in `year`.
 * Allotted = the custom quota (person > designation) or the type's yearly quota; carried forward =
 * unused days of the year before (stored or not), capped. "Used" is never touched,
 * so running it twice gives the same result.
 */
export async function allocateBalances(yearInput: number): Promise<SettingsResult> {
  return guarded("allocateBalances", async () => {
    const actor = await actionUser("settings.manage");
    const parsed = allocateYearSchema.safeParse(yearInput);
    if (!parsed.success) return fail("Pick a valid year.");
    const year = parsed.data;
    const yearStart = ymdToDb(`${year}-01-01`);
    const yearEnd = ymdToDb(`${year}-12-31`);

    const [employees, types] = await Promise.all([
      prisma.employee.findMany({
        where: { deletedAt: null, status: { not: "EXITED" }, joiningDate: { lte: yearEnd }, OR: [{ exitDate: null }, { exitDate: { gte: yearStart } }] },
        select: { id: true },
      }),
      prisma.leaveType.findMany({ where: { isActive: true } }),
    ]);
    if (!employees.length) return fail("There are no active employees to allocate to.");
    if (!types.length) return fail("Add or activate a leave type first.");

    const ids = employees.map((e) => e.id);
    // Custom quotas (person > designation > type) and carry forward from last year, stored or not.
    const plan = await loadAllocation(prisma, ids, year);

    let created = 0;
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const e of ids) {
        for (const t of types) {
          const alloc = plan.plan(e, t.id);
          const current = plan.stored(e, t.id, year);
          if (!current) {
            await tx.leaveBalance.create({ data: { employeeId: e, leaveTypeId: t.id, year, ...alloc } });
            created++;
          } else if (Number(current.allotted) !== alloc.allotted || Number(current.carriedForward) !== alloc.carriedForward) {
            await tx.leaveBalance.update({ where: { id: current.id }, data: alloc });
            updated++;
          }
        }
      }
      await writeAudit({ actorId: actor.id, action: "ALLOCATE", entity: "LeaveBalance", entityId: String(year), after: { year, employees: ids.length, leaveTypes: types.map((t) => t.code), created, updated } }, tx);
    }, { timeout: 60_000 });

    revalidateSettings();
    return ok(
      created || updated
        ? `${year} balances: ${created} created, ${updated} updated for ${ids.length} employee${ids.length === 1 ? "" : "s"}`
        : `${year} balances were already up to date`,
    );
  });
}

// ---- Departments & designations --------------------------------------------------------------

const LOOKUP_LABEL: Record<LookupKind, string> = { department: "Department", designation: "Designation" };

export async function renameLookup(kindInput: LookupKind, id: number, nameInput: string): Promise<SettingsResult> {
  return guarded("renameLookup", async () => {
    const actor = await actionUser("settings.manage");
    const kind = lookupKindSchema.parse(kindInput);
    z.number().int().positive().parse(id);
    const parsed = lookupNameSchema.safeParse(nameInput);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, "name");
    const name = parsed.data;
    const label = LOOKUP_LABEL[kind];

    const before = kind === "department" ? await prisma.department.findUnique({ where: { id } }) : await prisma.designation.findUnique({ where: { id } });
    if (!before) return fail(`This ${label.toLowerCase()} no longer exists.`);
    if (before.name === name) return ok("No changes");
    const clash = kind === "department" ? await prisma.department.findUnique({ where: { name } }) : await prisma.designation.findUnique({ where: { name } });
    if (clash && clash.id !== id) return fail(`${label} "${name}" already exists.`, "name");

    if (kind === "department") await prisma.department.update({ where: { id }, data: { name } });
    else await prisma.designation.update({ where: { id }, data: { name } });
    await writeAudit({ actorId: actor.id, action: "UPDATE", entity: label, entityId: id, before: { name: before.name }, after: { name } });
    revalidateSettings();
    revalidatePath("/employees");
    return ok(`Renamed to ${name}`);
  });
}

export async function deleteLookup(kindInput: LookupKind, id: number): Promise<SettingsResult> {
  return guarded("deleteLookup", async () => {
    const actor = await actionUser("settings.manage");
    const kind = lookupKindSchema.parse(kindInput);
    z.number().int().positive().parse(id);
    const label = LOOKUP_LABEL[kind];
    const row =
      kind === "department"
        ? await prisma.department.findUnique({ where: { id }, include: { _count: { select: { employees: true } } } })
        : await prisma.designation.findUnique({ where: { id }, include: { _count: { select: { employees: true } } } });
    if (!row) return fail(`This ${label.toLowerCase()} no longer exists.`);
    // Removed employees still point at it, so they count too.
    if (row._count.employees > 0) return fail(`${row.name} is used by ${row._count.employees} employee record${row._count.employees === 1 ? "" : "s"}.`);
    if (kind === "department") await prisma.department.delete({ where: { id } });
    else await prisma.designation.delete({ where: { id } });
    await writeAudit({ actorId: actor.id, action: "DELETE", entity: label, entityId: id, before: { name: row.name } });
    revalidateSettings();
    revalidatePath("/employees");
    return ok(`${row.name} deleted`);
  });
}

// ---- Daily report forms ------------------------------------------------------------

export async function saveReportForm(id: number | null, input: ReportFormInput): Promise<SettingsResult> {
  return guarded("saveReportForm", async () => {
    const actor = await actionUser("settings.manage");
    if (id !== null) z.number().int().positive().parse(id);
    const parsed = reportFormSchema.safeParse(input);
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    const before = id ? await prisma.reportTemplate.findUnique({ where: { id } }) : null;
    if (id && !before) return fail("This form no longer exists.");
    const ids = new Set<string>();
    for (const f of v.fields) {
      if (ids.has(f.id)) return fail("Two fields share an id. Remove one and add it again.");
      ids.add(f.id);
    }
    // The default form is for everyone, so it never has targets; the others need at least one.
    const isDefault = !!before?.isDefault;
    const designationIds = isDefault ? [] : [...new Set(v.designationIds)];
    const departmentIds = isDefault ? [] : [...new Set(v.departmentIds)];
    if (!isDefault && !designationIds.length && !departmentIds.length) return fail("Pick the designations or departments this form is for.", "designationIds");
    // A designation / department can only use one form.
    const others = await prisma.reportTemplate.findMany({ where: { isDefault: false, ...(id && { id: { not: id } }) } });
    for (const o of others) {
      const taken = (o.designationIds as number[]).find((d) => designationIds.includes(d)) ?? null;
      if (taken !== null) {
        const name = (await prisma.designation.findUnique({ where: { id: taken }, select: { name: true } }))?.name ?? "A designation";
        return fail(`${name} already uses the form "${o.name}".`, "designationIds");
      }
      const dept = (o.departmentIds as number[]).find((d) => departmentIds.includes(d)) ?? null;
      if (dept !== null) {
        const name = (await prisma.department.findUnique({ where: { id: dept }, select: { name: true } }))?.name ?? "A department";
        return fail(`${name} already uses the form "${o.name}".`, "departmentIds");
      }
    }
    const data = {
      name: v.name,
      sections: v.sections as unknown as Prisma.InputJsonValue,
      fields: v.fields as unknown as Prisma.InputJsonValue,
      designationIds,
      departmentIds,
    };
    await prisma.$transaction(async (tx) => {
      const t = id ? await tx.reportTemplate.update({ where: { id }, data }) : await tx.reportTemplate.create({ data: { ...data, isDefault: false } });
      await writeAudit({ actorId: actor.id, action: id ? "UPDATE" : "CREATE", entity: "ReportTemplate", entityId: t.id, after: { name: v.name, fields: v.fields.length, designationIds, departmentIds } }, tx);
    });
    revalidateSettings();
    revalidatePath("/daily-reports");
    return ok(id ? "Form saved" : "Form added");
  });
}

export async function deleteReportForm(id: number): Promise<SettingsResult> {
  return guarded("deleteReportForm", async () => {
    const actor = await actionUser("settings.manage");
    z.number().int().positive().parse(id);
    const t = await prisma.reportTemplate.findUnique({ where: { id } });
    if (!t) return fail("This form no longer exists.");
    if (t.isDefault) return fail("The default form can't be deleted. Change it instead.");
    await prisma.$transaction(async (tx) => {
      await tx.reportTemplate.delete({ where: { id } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "ReportTemplate", entityId: id, before: { name: t.name } }, tx);
    });
    revalidateSettings();
    revalidatePath("/daily-reports");
    return ok(`${t.name} deleted. Those people now use the default form.`);
  });
}
