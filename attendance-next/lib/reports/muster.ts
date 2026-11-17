import "server-only";
import type { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { istDate, monthDates, weekdayOf } from "@/lib/time";
import { musterTotals, type MusterTotals } from "./aggregate";
import { loadEmployeeDays } from "./data";

/** One cell of the grid, kept small (15 people × 31 days travel to the client). */
export interface MusterCell {
  /** Status, null for upcoming or still-open days */
  s: AttendanceStatus | null;
  in: number | null;
  out: number | null;
  /** Holiday or weekly off for this person */
  off: boolean;
  /** Edited by HR (manual source or a status override) */
  edited: boolean;
  /** Has a remark */
  note: boolean;
  late: number;
  worked: number;
}

export interface MusterRow {
  id: number;
  code: string;
  name: string;
  department: string | null;
  cells: MusterCell[];
  totals: MusterTotals;
}

export interface MusterDate {
  date: string;
  day: number;
  weekday: number;
  holiday: string | null;
  /** Off for everyone shown (holiday or weekly off) */
  off: boolean;
  today: boolean;
  future: boolean;
}

export interface MusterData {
  month: string;
  today: string;
  dates: MusterDate[];
  rows: MusterRow[];
}

/**
 * The muster roll for a month: every employee employed in it (within `reach`, null = everyone),
 * every day computed by the attendance service.
 */
export async function loadMuster(month: string, department: number | null, reach: number[] | null = null, now = new Date()): Promise<MusterData> {
  const dates = monthDates(month);
  const today = istDate(now);
  const list = await loadEmployeeDays({ from: dates[0]!, to: dates.at(-1)!, department, reach }, now);
  const holidays = new Map(
    (await prisma.holiday.findMany({ where: { date: { gte: new Date(`${dates[0]}T00:00:00Z`), lte: new Date(`${dates.at(-1)}T00:00:00Z`) } } })).map((h) => [
      h.date.toISOString().slice(0, 10),
      h.name,
    ]),
  );

  return {
    month,
    today,
    dates: dates.map((date, i) => {
      const day = list.map((e) => e.days[i]!).filter((d) => d.status !== "NOT_JOINED" && d.status !== "EXITED");
      return {
        date,
        day: Number(date.slice(8)),
        weekday: weekdayOf(date),
        holiday: holidays.get(date) ?? null,
        off: holidays.has(date) || (day.length > 0 && day.every((d) => d.weeklyOff || d.holiday)),
        today: date === today,
        future: date > today,
      };
    }),
    rows: list.map(({ employee, days }) => ({
      ...employee,
      totals: musterTotals(days),
      cells: days.map((d) => ({
        s: d.future ? null : d.status,
        in: d.future ? null : d.inMin,
        out: d.future ? null : d.outMin,
        off: !!d.holiday || d.weeklyOff,
        edited: d.source === "MANUAL" || d.overridden,
        note: !!d.remarks,
        late: d.lateMinutes,
        worked: d.workedMinutes,
      })),
    })),
  };
}
