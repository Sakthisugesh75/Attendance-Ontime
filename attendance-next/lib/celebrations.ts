import { prisma } from "@/lib/prisma";
import { addDays, dbToYmd, istDate, ymdToDb } from "@/lib/time";

/**
 * Birthdays and work anniversaries. The date maths is pure (unit-tested); `loadCelebrations`
 * reads the active employees. Feb 29 dates fall on Feb 28 in non-leap years.
 */

export interface CelebrationPerson {
  id: number;
  name: string;
  photo: string | null;
  designation: string | null;
  /** "YYYY-MM-DD" or null when not recorded */
  dateOfBirth: string | null;
  joiningDate: string;
}

export type CelebrationKind = "BIRTHDAY" | "ANNIVERSARY";

export interface Celebration {
  kind: CelebrationKind;
  /** The IST day it falls on */
  date: string;
  /** 0 = today */
  daysAway: number;
  /** Age turning (birthday) or years completed (anniversary, always ≥ 1) */
  years: number;
  person: CelebrationPerson;
}

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The day a yearly date ("1992-02-29") falls on in `year` (Feb 29 → Feb 28 outside leap years). */
export function occurrenceIn(ymd: string, year: number): string {
  const mmdd = ymd.slice(5);
  return mmdd === "02-29" && !isLeapYear(year) ? `${year}-02-28` : `${year}-${mmdd}`;
}

const daysBetween = (a: string, b: string) => Math.round((ymdToDb(b).getTime() - ymdToDb(a).getTime()) / 86_400_000);

/**
 * Birthdays and work anniversaries (1 year or more) from `today` to `today + days` inclusive,
 * soonest first; on the same day birthdays come before anniversaries, then by name.
 * Handles the year wrap (e.g. late December looking into January).
 */
export function upcomingCelebrations(people: CelebrationPerson[], today: string, days = 14): Celebration[] {
  const span = Math.min(Math.max(Math.trunc(days), 0), 365);
  const end = addDays(today, span);
  const year = Number(today.slice(0, 4));
  const out: Celebration[] = [];

  for (const person of people) {
    const sources: [CelebrationKind, string | null][] = [
      ["BIRTHDAY", person.dateOfBirth],
      ["ANNIVERSARY", person.joiningDate],
    ];
    for (const [kind, from] of sources) {
      if (!from) continue;
      for (const y of [year, year + 1]) {
        const date = occurrenceIn(from, y);
        if (date < today || date > end) continue;
        const years = y - Number(from.slice(0, 4));
        if (years >= 1) out.push({ kind, date, daysAway: daysBetween(today, date), years, person });
        break;
      }
    }
  }

  return out.sort((a, b) => a.daysAway - b.daysAway || (a.kind === b.kind ? 0 : a.kind === "BIRTHDAY" ? -1 : 1) || a.person.name.localeCompare(b.person.name));
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd" */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Priya's birthday 🎂" / "Karthik's 3rd work anniversary" */
export function celebrationPhrase(c: Pick<Celebration, "kind" | "years" | "person">): string {
  const who = `${firstName(c.person.name)}'s`;
  return c.kind === "BIRTHDAY" ? `${who} birthday 🎂` : `${who} ${ordinal(c.years)} work anniversary`;
}

/** Bell notification for a day's celebrations; null when there are none. */
export function celebrationMessage(today: Celebration[]): { title: string; body: string } | null {
  if (!today.length) return null;
  const title = today.length <= 2 ? `Today: ${today.map(celebrationPhrase).join(" · ")}` : `Today: ${today.length} celebrations 🎉`;
  const body = today
    .map((c) => (c.kind === "BIRTHDAY" ? `Wish ${c.person.name} a happy birthday!` : `${c.person.name} completes ${c.years} year${c.years === 1 ? "" : "s"} with us.`))
    .join(" ");
  return { title, body };
}

/** Celebrations of active employees (joined, not exited, not removed) in the next `days` days. */
export async function loadCelebrations(days = 14, today: string = istDate()): Promise<Celebration[]> {
  const rows = await prisma.employee.findMany({
    where: { deletedAt: null, status: { not: "EXITED" }, joiningDate: { lte: ymdToDb(today) }, OR: [{ exitDate: null }, { exitDate: { gte: ymdToDb(today) } }] },
    select: { id: true, fullName: true, photoPath: true, dateOfBirth: true, joiningDate: true, designation: { select: { name: true } } },
  });
  const people: CelebrationPerson[] = rows.map((e) => ({
    id: e.id,
    name: e.fullName,
    photo: e.photoPath ? `/api/files/${e.photoPath}` : null,
    designation: e.designation?.name ?? null,
    dateOfBirth: e.dateOfBirth ? dbToYmd(e.dateOfBirth) : null,
    joiningDate: dbToYmd(e.joiningDate),
  }));
  return upcomingCelebrations(people, today, days);
}
