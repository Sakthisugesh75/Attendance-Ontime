"use server";

import { Prisma, type Holiday } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeRange } from "@/lib/attendance/service";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden } from "@/lib/session";
import { dbToYmd, formatDate, ymdToDb } from "@/lib/time";
import { holidayDates, holidaySchema, newHolidaySchema, type HolidayInput, type NewHolidayInput } from "@/lib/validations/holidays";

export type HolidayResult = { ok: true; message: string } | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string): HolidayResult => ({ ok: false, error, field });

const snapshot = (h: Holiday) => ({ date: dbToYmd(h.date), name: h.name, type: h.type, isDeclared: h.isDeclared });

/** Re-stores the day for everyone employed on it (holiday vs absent / weekly off). Future days are skipped. */
async function recomputeDate(ymd: string) {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null, joiningDate: { lte: ymdToDb(ymd) }, OR: [{ exitDate: null }, { exitDate: { gte: ymdToDb(ymd) } }] },
    select: { id: true },
  });
  for (const e of employees) await recomputeRange(e.id, ymd, ymd);
}

function revalidate() {
  revalidatePath("/holidays");
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
}

async function guarded(name: string, run: () => Promise<HolidayResult>): Promise<HolidayResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fail("There is already a holiday on this date.", "date");
    console.error(`${name} failed`, err);
    return fail("Could not save the holiday. Try again.");
  }
}

/** "14–16 Jan 2026", "30 Jan – 2 Feb 2026", "30 Dec 2026 – 2 Jan 2027" */
function rangeLabel(from: string, to: string) {
  const [a, b] = [formatDate(from), formatDate(to)];
  if (from.slice(0, 7) === to.slice(0, 7)) return `${a.slice(0, 2)}–${b}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${a.slice(0, 6)} – ${b}`;
  return `${a} – ${b}`;
}

/**
 * Adds a holiday on one day, or on every day of a range (e.g. a 3-day Pongal break). Days that
 * already have a holiday are skipped and named in the message; if every day is taken, nothing is added.
 */
export async function createHoliday(input: NewHolidayInput): Promise<HolidayResult> {
  return guarded("createHoliday", async () => {
    const actor = await actionUser("holidays.manage");
    const parsed = newHolidaySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;
    const dates = holidayDates(v.date, v.toDate);
    const taken = await prisma.holiday.findMany({ where: { date: { in: dates.map(ymdToDb) } } });
    const takenOn = new Map(taken.map((h) => [dbToYmd(h.date), h.name]));
    const free = dates.filter((d) => !takenOn.has(d));
    if (!free.length) {
      if (dates.length === 1) return fail(`${formatDate(v.date)} is already ${takenOn.get(v.date)}.`, "date");
      return fail("Every day in this range already has a holiday.", "toDate");
    }

    await prisma.$transaction(async (tx) => {
      for (const d of free) {
        const h = await tx.holiday.create({ data: { date: ymdToDb(d), name: v.name, type: v.type, isDeclared: v.isDeclared } });
        await writeAudit({ actorId: actor.id, action: "CREATE", entity: "Holiday", entityId: h.id, after: { ...snapshot(h), ...(dates.length > 1 && { range: `${v.date} to ${v.toDate}` }) } }, tx);
      }
    });
    for (const d of free) await recomputeDate(d);
    revalidate();

    if (dates.length === 1) return { ok: true, message: `${v.name} added on ${formatDate(v.date)}` };
    const skipped = dates.filter((d) => takenOn.has(d)).map((d) => `${formatDate(d).slice(0, 6)} (${takenOn.get(d)})`);
    return {
      ok: true,
      message: `${v.name} added on ${rangeLabel(v.date, dates.at(-1)!)} · ${free.length} day${free.length === 1 ? "" : "s"}${skipped.length ? `. Skipped ${skipped.join(", ")}: already a holiday` : ""}`,
    };
  });
}

export async function updateHoliday(id: number, input: HolidayInput): Promise<HolidayResult> {
  return guarded("updateHoliday", async () => {
    const actor = await actionUser("holidays.manage");
    z.number().int().positive().parse(id);
    const parsed = holidaySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;
    const before = await prisma.holiday.findUnique({ where: { id } });
    if (!before) return fail("This holiday no longer exists.");
    const clash = await prisma.holiday.findUnique({ where: { date: ymdToDb(v.date) } });
    if (clash && clash.id !== id) return fail(`${formatDate(v.date)} is already ${clash.name}.`, "date");

    const after = await prisma.$transaction(async (tx) => {
      const h = await tx.holiday.update({ where: { id }, data: { date: ymdToDb(v.date), name: v.name, type: v.type, isDeclared: v.isDeclared } });
      await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "Holiday", entityId: id, before: snapshot(before), after: snapshot(h) }, tx);
      return h;
    });
    const oldDate = dbToYmd(before.date);
    if (oldDate !== v.date) await recomputeDate(oldDate);
    await recomputeDate(v.date);
    revalidate();
    return { ok: true, message: `${after.name} saved` };
  });
}

export async function deleteHoliday(id: number): Promise<HolidayResult> {
  return guarded("deleteHoliday", async () => {
    const actor = await actionUser("holidays.manage");
    z.number().int().positive().parse(id);
    const before = await prisma.holiday.findUnique({ where: { id } });
    if (!before) return fail("This holiday no longer exists.");
    await prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "Holiday", entityId: id, before: snapshot(before) }, tx);
    });
    await recomputeDate(dbToYmd(before.date));
    revalidate();
    return { ok: true, message: `${before.name} removed` };
  });
}
