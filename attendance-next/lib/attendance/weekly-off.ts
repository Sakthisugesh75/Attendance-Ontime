import { nthWeekdayOfMonth, weekdayOf } from "@/lib/time";

/** { "<weekday 0-6>": "ALL" | [nth occurrences in the month] } */
export type WeeklyOffPattern = Partial<Record<string, "ALL" | number[]>>;

export interface WeeklyOffRuleLike {
  shiftId: number | null;
  effectiveFrom: string;
  pattern: WeeklyOffPattern;
  customOffDates?: string[] | null;
  customWorkDates?: string[] | null;
}

export const SATURDAY_POLICIES = {
  ALL_WORKING: { label: "All Saturdays working", pattern: { "0": "ALL" } },
  ALL_OFF: { label: "All Saturdays off", pattern: { "0": "ALL", "6": "ALL" } },
  ALT_1_3: { label: "1st & 3rd Saturday off", pattern: { "0": "ALL", "6": [1, 3] } },
  ALT_2_4: { label: "2nd & 4th Saturday off", pattern: { "0": "ALL", "6": [2, 4] } },
} as const satisfies Record<string, { label: string; pattern: WeeklyOffPattern }>;

export function matchesPattern(pattern: WeeklyOffPattern, ymd: string): boolean {
  const rule = pattern[String(weekdayOf(ymd))];
  if (!rule) return false;
  return rule === "ALL" || rule.includes(nthWeekdayOfMonth(ymd));
}

/** The rule in force on a date: a shift-specific rule beats the company-wide one. */
export function ruleInForce<R extends WeeklyOffRuleLike>(rules: R[], ymd: string, shiftId: number | null): R | null {
  const pick = (list: R[]) =>
    list.filter((r) => r.effectiveFrom <= ymd).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
  return (shiftId !== null ? pick(rules.filter((r) => r.shiftId === shiftId)) : null) ?? pick(rules.filter((r) => r.shiftId === null));
}

export function isWeeklyOff(rules: WeeklyOffRuleLike[], ymd: string, shiftId: number | null): boolean {
  const rule = ruleInForce(rules, ymd, shiftId);
  if (!rule) return false;
  if (rule.customWorkDates?.includes(ymd)) return false;
  if (rule.customOffDates?.includes(ymd)) return true;
  return matchesPattern(rule.pattern, ymd);
}
