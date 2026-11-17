import { z } from "zod";

export const HOLIDAY_TYPES = ["NATIONAL", "STATE", "COMPANY", "OPTIONAL"] as const;
export type HolidayTypeKey = (typeof HOLIDAY_TYPES)[number];

export const HOLIDAY_TYPE_LABEL: Record<HolidayTypeKey, string> = {
  NATIONAL: "National",
  STATE: "State",
  COMPANY: "Company",
  OPTIONAL: "Optional",
};

/** Shared by the holiday sheet (client) and the holiday actions (server). */
export const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  name: z.string().trim().min(2, "Enter the holiday name").max(150),
  type: z.enum(HOLIDAY_TYPES),
  isDeclared: z.boolean(),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

/** Longest stretch added in one go (e.g. a school-style break); longer needs two entries. */
export const MAX_HOLIDAY_SPAN = 31;

/** Adding: one day, or every day from `date` to `toDate` (inclusive) under the same name. */
export const newHolidaySchema = holidaySchema
  .extend({ toDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the last day")]).optional() })
  .superRefine((v, ctx) => {
    if (!v.toDate) return;
    if (v.toDate < v.date) ctx.addIssue({ code: "custom", path: ["toDate"], message: "The last day can't be before the first day" });
    else if (holidayDates(v.date, v.toDate).length > MAX_HOLIDAY_SPAN) ctx.addIssue({ code: "custom", path: ["toDate"], message: `Up to ${MAX_HOLIDAY_SPAN} days at a time` });
  });
export type NewHolidayInput = z.infer<typeof newHolidaySchema>;

/** Every date from `from` to `to` inclusive (YYYY-MM-DD); just `from` when `to` is empty or earlier. */
export function holidayDates(from: string, to?: string): string[] {
  const out = [from];
  if (!to || to <= from) return out;
  const d = new Date(`${from}T00:00:00Z`);
  // Capped so a bad range can never loop for long.
  while (out.length <= MAX_HOLIDAY_SPAN) {
    d.setUTCDate(d.getUTCDate() + 1);
    const ymd = d.toISOString().slice(0, 10);
    if (ymd > to) break;
    out.push(ymd);
  }
  return out;
}

export const holidayYearSchema = z.coerce.number().int().min(2000).max(2100);
