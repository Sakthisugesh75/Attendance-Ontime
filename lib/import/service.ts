import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { AttendanceRecord, Prisma } from "@prisma/client";
import { recomputeRange } from "@/lib/attendance/service";
import { isWeeklyOff, ruleInForce, type WeeklyOffPattern } from "@/lib/attendance/weekly-off";
import { writeAudit } from "@/lib/audit";
import { nextEmployeeCode } from "@/lib/employees";
import { bestMatches, MATCH_THRESHOLD } from "@/lib/excel/name-match";
import { parseWorkbook, type ParsedWorkbook } from "@/lib/excel/parse-workbook";
import { prisma } from "@/lib/prisma";
import { addDays, dbToYmd, istAt, istDate, minutesToHhmm, ymdToDb } from "@/lib/time";
import type { CommitImportInput } from "@/lib/validations/import";

const STORAGE = path.join(process.cwd(), "storage", "imports");
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
/** No attendance for this many days before the file's last date suggests the person has left. */
const LEFT_AFTER_DAYS = 21;

export class ImportError extends Error {}

/** Parses an uploaded workbook and stores it as a PREVIEW batch. Nothing else is written. */
export async function createPreview(file: File, actorId: number) {
  if (!/\.xlsx$/i.test(file.name)) throw new ImportError("Upload an Excel .xlsx file. Older .xls files: open in Excel and Save As .xlsx.");
  if (file.size === 0) throw new ImportError("The file is empty.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("The file is larger than 10 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportError("This file couldn't be opened as an Excel workbook.");
  }
  const parsed = parseWorkbook(wb);
  if (!parsed.entries.length && !parsed.offDays.length) {
    throw new ImportError("No attendance found. Each sheet needs a row with the employee names above a 'Date | In | Out | Remarks' header.");
  }

  await mkdir(STORAGE, { recursive: true });
  const stored = `${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, "_").slice(-120)}`;
  await writeFile(path.join(STORAGE, stored), buffer);

  const batch = await prisma.importBatch.create({
    data: { fileName: file.name.slice(0, 255), filePath: `imports/${stored}`, preview: parsed as unknown as Prisma.InputJsonValue, createdById: actorId },
  });
  await writeAudit({ actorId, action: "IMPORT_UPLOAD", entity: "ImportBatch", entityId: batch.id, after: { fileName: file.name, entries: parsed.entries.length } });
  return batch.id;
}

export async function listBatches() {
  const rows = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, fileName: true, status: true, createdAt: true, committedAt: true, result: true, preview: true, createdBy: { select: { name: true, email: true } } },
  });
  return rows.map((b) => {
    const p = b.preview as unknown as ParsedWorkbook;
    const r = b.result as ImportResult | null;
    return {
      id: b.id,
      fileName: b.fileName,
      status: b.status,
      createdAt: b.createdAt,
      by: b.createdBy.name || b.createdBy.email || "—",
      range: p.firstDate && p.latestDate ? { from: p.firstDate, to: p.latestDate } : null,
      people: p.people.length,
      days: r?.counts ? r.counts.created + r.counts.updated : null,
    };
  });
}

/** The parsed file plus suggestions: who matches whom, which holidays are new, which off days differ. */
export async function loadPreview(id: number) {
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { createdBy: { select: { name: true, email: true } } } });
  if (!batch) return null;
  const parsed = batch.preview as unknown as ParsedWorkbook;

  const [employees, holidays, rules, departments] = await Promise.all([
    prisma.employee.findMany({ where: { deletedAt: null }, select: { id: true, fullName: true, code: true, joiningDate: true, exitDate: true, status: true }, orderBy: { fullName: "asc" } }),
    prisma.holiday.findMany(),
    // The old log follows the company-wide week.
    prisma.weeklyOffRule.findMany({ where: { shiftId: null, departmentId: null, designationId: null } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const holidayByDate = new Map(holidays.map((h) => [dbToYmd(h.date), h.name]));
  const ruleLikes = rules.map((r) => ({
    shiftId: r.shiftId,
    effectiveFrom: dbToYmd(r.effectiveFrom),
    pattern: r.pattern as WeeklyOffPattern,
    customOffDates: (r.customOffDates as string[] | null) ?? null,
    customWorkDates: (r.customWorkDates as string[] | null) ?? null,
  }));

  const latest = parsed.latestDate;
  const people = parsed.people.map((p) => {
    const matches = bestMatches(p.names[0]!, employees).map((m) => ({ id: m.candidate.id, fullName: m.candidate.fullName, code: m.candidate.code, score: Math.round(m.score * 100) }));
    const top = matches[0];
    const left = latest && p.lastWorked && addDays(p.lastWorked, LEFT_AFTER_DAYS) < latest;
    return {
      ...p,
      matches,
      suggestion: {
        action: top && top.score >= MATCH_THRESHOLD * 100 ? ("match" as const) : ("create" as const),
        employeeId: top && top.score >= MATCH_THRESHOLD * 100 ? top.id : null,
        joiningDate: p.firstWorked ?? p.firstSeen,
        exitDate: left ? p.lastWorked! : "",
        status: left ? ("EXITED" as const) : ("ACTIVE" as const),
      },
    };
  });

  const holidayRows = new Map<string, { date: string; label: string; existing: string | null }>();
  const extraOff: { date: string; label: string }[] = [];
  for (const o of parsed.offDays) {
    if (o.kind === "HOLIDAY") {
      holidayRows.set(o.date, { date: o.date, label: o.label, existing: holidayByDate.get(o.date) ?? null });
    } else if (!holidayByDate.has(o.date) && !isWeeklyOff(ruleLikes, o.date, null)) {
      extraOff.push({ date: o.date, label: o.label });
    }
  }

  return {
    batch: {
      id: batch.id,
      fileName: batch.fileName,
      status: batch.status,
      createdAt: batch.createdAt,
      committedAt: batch.committedAt,
      undoneAt: batch.undoneAt,
      by: batch.createdBy.name || batch.createdBy.email || "—",
      result: batch.result as ImportResult | null,
      error: batch.error,
    },
    parsed: { sheets: parsed.sheets, issues: parsed.issues, firstDate: parsed.firstDate, latestDate: parsed.latestDate, entries: parsed.entries.length },
    statusCounts: parsed.entries.reduce<Record<string, number>>((acc, e) => {
      const k = e.status ?? (e.in !== null || e.out !== null ? "TIMES" : "REMARK");
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    people,
    holidays: [...holidayRows.values()].sort((a, b) => a.date.localeCompare(b.date)),
    extraOff: extraOff.sort((a, b) => a.date.localeCompare(b.date)),
    employees: employees.map((e) => ({ id: e.id, fullName: e.fullName, code: e.code })),
    departments: departments.map((d) => d.name),
  };
}

export type ImportPreview = NonNullable<Awaited<ReturnType<typeof loadPreview>>>;

export interface ImportResult {
  options: { strategy: "skip" | "overwrite"; people: { key: string; action: string; employeeId: number | null }[] };
  createdEmployeeIds: number[];
  createdHolidayIds: number[];
  /** Custom off dates added to weekly-off rules, so undo can remove exactly those */
  addedOffDates: { ruleId: number; dates: string[] }[];
  counts: { created: number; updated: number; keptExisting: number; outsideEmployment: number; skippedPeople: number };
  employees: { id: number; from: string }[];
}

type RecordSnapshot = Pick<AttendanceRecord, "punchInAt" | "punchOutAt" | "statusOverride" | "remarks" | "source" | "importBatchId">;
const snapshotOf = (r: AttendanceRecord): RecordSnapshot => ({
  punchInAt: r.punchInAt,
  punchOutAt: r.punchOutAt,
  statusOverride: r.statusOverride,
  remarks: r.remarks,
  source: r.source,
  importBatchId: r.importBatchId,
});
/** A record with real data (not just a status the end-of-day job stored). */
const hasRealData = (r: AttendanceRecord) => !!(r.punchInAt || r.punchOutAt || r.statusOverride || r.remarks);

export async function commitImport(id: number, options: CommitImportInput & { strategy: "skip" | "overwrite" }, actorId: number): Promise<ImportResult> {
  // Claim the batch so a double click can't import twice.
  const claimed = await prisma.importBatch.updateMany({ where: { id, status: "PREVIEW", committedAt: null }, data: { committedAt: new Date() } });
  if (!claimed.count) throw new ImportError("This import was already confirmed or is no longer a preview.");

  try {
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id } });
    const parsed = batch.preview as unknown as ParsedWorkbook;
    const choices = new Map(options.people.map((p) => [p.key, p]));
    const today = istDate();

    const result = await prisma.$transaction(
      async (tx) => {
        const res: ImportResult = {
          options: { strategy: options.strategy, people: options.people.map((p) => ({ key: p.key, action: p.action, employeeId: p.employeeId })) },
          createdEmployeeIds: [],
          createdHolidayIds: [],
          addedOffDates: [],
          counts: { created: 0, updated: 0, keptExisting: 0, outsideEmployment: 0, skippedPeople: 0 },
          employees: [],
        };

        // 1. People -> employees
        const defaultShift = (await tx.shift.findFirst({ where: { isDefault: true } })) ?? (await tx.shift.findFirst());
        if (!defaultShift) throw new ImportError("Create a shift first: new employees need one.");
        const target = new Map<string, { id: number; joining: string; exit: string | null }>();
        for (const person of parsed.people) {
          const c = choices.get(person.key);
          if (!c || c.action === "skip") {
            res.counts.skippedPeople++;
            continue;
          }
          if (c.action === "match") {
            const e = await tx.employee.findFirst({ where: { id: c.employeeId!, deletedAt: null } });
            if (!e) throw new ImportError(`The employee matched to "${person.names[0]}" no longer exists.`);
            target.set(person.key, { id: e.id, joining: dbToYmd(e.joiningDate), exit: e.exitDate ? dbToYmd(e.exitDate) : null });
          } else {
            const department = c.department ? await tx.department.upsert({ where: { name: c.department }, create: { name: c.department }, update: {} }) : null;
            const e = await tx.employee.create({
              data: {
                code: await nextEmployeeCode(tx),
                fullName: c.fullName,
                joiningDate: ymdToDb(c.joiningDate),
                exitDate: c.exitDate ? ymdToDb(c.exitDate) : null,
                status: c.status,
                departmentId: department?.id ?? null,
                shifts: { create: { shiftId: defaultShift.id, effectiveFrom: ymdToDb(c.joiningDate) } },
              },
            });
            res.createdEmployeeIds.push(e.id);
            target.set(person.key, { id: e.id, joining: c.joiningDate, exit: c.exitDate || null });
          }
        }

        // 2. Holidays and extra off days
        for (const h of options.holidays) {
          const exists = await tx.holiday.findUnique({ where: { date: ymdToDb(h.date) } });
          if (exists) continue;
          const created = await tx.holiday.create({ data: { date: ymdToDb(h.date), name: h.name, type: "COMPANY", isDeclared: true } });
          res.createdHolidayIds.push(created.id);
        }
        if (options.extraOffDays.length) {
          const rules = await tx.weeklyOffRule.findMany({ where: { shiftId: null, departmentId: null, designationId: null } });
          const like = rules.map((r) => ({ id: r.id, shiftId: null, effectiveFrom: dbToYmd(r.effectiveFrom), pattern: r.pattern as WeeklyOffPattern }));
          const byRule = new Map<number, string[]>();
          for (const d of options.extraOffDays) {
            const rule = ruleInForce(like, d, null);
            if (rule) byRule.set(rule.id, [...(byRule.get(rule.id) ?? []), d]);
          }
          for (const [ruleId, dates] of byRule) {
            const rule = rules.find((r) => r.id === ruleId)!;
            const current = (rule.customOffDates as string[] | null) ?? [];
            const added = dates.filter((d) => !current.includes(d));
            if (!added.length) continue;
            await tx.weeklyOffRule.update({ where: { id: ruleId }, data: { customOffDates: [...current, ...added].sort() } });
            res.addedOffDates.push({ ruleId, dates: added });
          }
        }

        // 3. Attendance
        const ids = [...new Set([...target.values()].map((t) => t.id))];
        const existing = await tx.attendanceRecord.findMany({
          where: { employeeId: { in: ids }, date: { gte: ymdToDb(parsed.firstDate ?? today), lte: ymdToDb(parsed.latestDate ?? today) } },
        });
        const existingByKey = new Map(existing.map((r) => [`${r.employeeId}:${dbToYmd(r.date)}`, r]));
        const toCreate: Prisma.AttendanceRecordCreateManyInput[] = [];
        const firstDate = new Map<number, string>();

        for (const e of parsed.entries) {
          const t = target.get(e.person);
          if (!t) continue;
          if (e.date < t.joining || (t.exit && e.date > t.exit)) {
            res.counts.outsideEmployment++;
            continue;
          }
          const data = {
            punchInAt: e.in !== null ? istAt(e.date, minutesToHhmm(e.in)) : null,
            punchOutAt: e.out !== null ? istAt(e.date, minutesToHhmm(e.out)) : null,
            statusOverride: e.status,
            remarks: e.remark ? e.remark.slice(0, 500) : null,
            source: "IMPORT" as const,
            importBatchId: id,
          };
          const prev = existingByKey.get(`${t.id}:${e.date}`);
          if (prev && hasRealData(prev) && options.strategy === "skip") {
            res.counts.keptExisting++;
            continue;
          }
          if (prev) {
            await tx.importChange.create({ data: { batchId: id, recordId: prev.id, before: snapshotOf(prev) as unknown as Prisma.InputJsonValue } });
            await tx.attendanceRecord.update({ where: { id: prev.id }, data });
            res.counts.updated++;
          } else {
            toCreate.push({ employeeId: t.id, date: ymdToDb(e.date), ...data });
            res.counts.created++;
          }
          if (!firstDate.has(t.id) || e.date < firstDate.get(t.id)!) firstDate.set(t.id, e.date);
        }
        for (let i = 0; i < toCreate.length; i += 500) await tx.attendanceRecord.createMany({ data: toCreate.slice(i, i + 500) });

        // Recompute from the earliest of: imported data, new joining date, first added holiday / off day.
        const earliestCalendar = [...options.holidays.map((h) => h.date), ...options.extraOffDays].sort()[0];
        for (const t of new Set(target.values())) {
          const from = [firstDate.get(t.id), res.createdEmployeeIds.includes(t.id) ? t.joining : undefined, earliestCalendar].filter((d): d is string => !!d).sort()[0];
          if (from && !res.employees.some((x) => x.id === t.id)) res.employees.push({ id: t.id, from });
        }

        await tx.importBatch.update({ where: { id }, data: { status: "DONE", result: res as unknown as Prisma.InputJsonValue } });
        await writeAudit({ actorId, action: "IMPORT_COMMIT", entity: "ImportBatch", entityId: id, after: { counts: res.counts, createdEmployees: res.createdEmployeeIds.length, createdHolidays: res.createdHolidayIds.length } }, tx);
        return res;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    // Store computed statuses for every affected day (present, late, absent, holiday …).
    for (const e of result.employees) await recomputeRange(e.id, e.from, today);
    return result;
  } catch (err) {
    // Release the claim so the admin can fix the problem and try again.
    await prisma.importBatch.update({ where: { id }, data: { committedAt: null, error: err instanceof Error ? err.message.slice(0, 1000) : "Import failed" } }).catch(() => {});
    throw err;
  }
}

/**
 * Undo: removes records the import created, restores records it overwrote, removes the
 * holidays and off days it added, and removes employees it created that have no other data.
 */
export async function undoImport(id: number, actorId: number) {
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { changes: true } });
  if (!batch || batch.status !== "DONE") throw new ImportError("Only a finished import can be undone.");
  const res = batch.result as unknown as ImportResult;
  const today = istDate();
  const removedEmployees: number[] = [];

  await prisma.$transaction(
    async (tx) => {
      for (const c of batch.changes) {
        const before = c.before as unknown as RecordSnapshot;
        await tx.attendanceRecord.updateMany({
          where: { id: c.recordId },
          data: {
            punchInAt: before.punchInAt ? new Date(before.punchInAt) : null,
            punchOutAt: before.punchOutAt ? new Date(before.punchOutAt) : null,
            statusOverride: before.statusOverride,
            remarks: before.remarks,
            source: before.source,
            importBatchId: before.importBatchId,
          },
        });
      }
      await tx.attendanceRecord.deleteMany({ where: { importBatchId: id } });
      if (res.createdHolidayIds.length) await tx.holiday.deleteMany({ where: { id: { in: res.createdHolidayIds } } });
      for (const { ruleId, dates } of res.addedOffDates) {
        const rule = await tx.weeklyOffRule.findUnique({ where: { id: ruleId } });
        if (!rule) continue;
        const kept = ((rule.customOffDates as string[] | null) ?? []).filter((d) => !dates.includes(d));
        await tx.weeklyOffRule.update({ where: { id: ruleId }, data: { customOffDates: kept.length ? kept : undefined } });
      }
      for (const empId of res.createdEmployeeIds) {
        const e = await tx.employee.findUnique({ where: { id: empId }, include: { _count: { select: { requests: true } } } });
        if (!e || e.userId || e._count.requests) continue;
        const realRecords = await tx.attendanceRecord.count({ where: { employeeId: empId, OR: [{ punchInAt: { not: null } }, { statusOverride: { not: null } }, { remarks: { not: null } }] } });
        if (realRecords) continue;
        await tx.attendanceRecord.deleteMany({ where: { employeeId: empId } });
        await tx.shiftAssignment.deleteMany({ where: { employeeId: empId } });
        await tx.leaveBalance.deleteMany({ where: { employeeId: empId } });
        await tx.employee.updateMany({ where: { managerId: empId }, data: { managerId: null } });
        await tx.employee.delete({ where: { id: empId } });
        removedEmployees.push(empId);
      }
      await tx.importBatch.update({ where: { id }, data: { status: "UNDONE", undoneAt: new Date() } });
      await writeAudit({ actorId, action: "IMPORT_UNDO", entity: "ImportBatch", entityId: id, after: { removedEmployees: removedEmployees.length } }, tx);
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  for (const e of res.employees) if (!removedEmployees.includes(e.id)) await recomputeRange(e.id, e.from, today);
  return { removedEmployees: removedEmployees.length, keptEmployees: res.createdEmployeeIds.length - removedEmployees.length };
}
