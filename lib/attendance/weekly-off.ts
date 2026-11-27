import { nthWeekdayOfMonth, weekdayOf } from "@/lib/time";

/** { "<weekday 0-6>": "ALL" | [nth occurrences in the month] } */
export type WeeklyOffPattern = Partial<Record<string, "ALL" | number[]>>;

export interface WeeklyOffRuleLike {
  shiftId: number | null;
  /** A department's own rule */
  departmentId?: number | null;
  /** A designation's own rule */
  designationId?: number | null;
  /** From effectiveFrom this group follows the next level again */
  inherit?: boolean;
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

/** Who a rule is looked up for: their shift, department and designation on that day. */
export interface OffScope {
  shiftId: number | null;
  departmentId?: number | null;
  designationId?: number | null;
}

/** A company-wide rule (not tied to a shift, department or designation). */
export const isCompanyRule = (r: WeeklyOffRuleLike) => r.shiftId === null && !r.departmentId && !r.designationId;

/**
 * The rule in force on a date. Most specific wins: designation, then department, then shift,
 * then the company rule. Within a level the latest rule that has started applies; when that is
 * an "inherit" rule, the level is skipped from that date. A bare shift id (or null) looks up
 * only shift and company rules.
 */
export function ruleInForce<R extends WeeklyOffRuleLike>(rules: R[], ymd: string, scope: number | null | OffScope): R | null {
  const s: OffScope = scope !== null && typeof scope === "object" ? scope : { shiftId: scope };
  const pick = (list: R[]) =>
    list.filter((r) => r.effectiveFrom <= ymd).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
  const levels: R[][] = [
    s.designationId ? rules.filter((r) => r.designationId === s.designationId) : [],
    s.departmentId ? rules.filter((r) => r.departmentId === s.departmentId && !r.designationId) : [],
    s.shiftId !== null ? rules.filter((r) => r.shiftId === s.shiftId && !r.departmentId && !r.designationId) : [],
  ];
  for (const level of levels) {
    const r = pick(level);
    if (r && !r.inherit) return r;
  }
  return pick(rules.filter(isCompanyRule));
}

export function isWeeklyOff(rules: WeeklyOffRuleLike[], ymd: string, scope: number | null | OffScope): boolean {
  const rule = ruleInForce(rules, ymd, scope);
  if (!rule) return false;
  if (rule.customWorkDates?.includes(ymd)) return false;
  if (rule.customOffDates?.includes(ymd)) return true;
  return matchesPattern(rule.pattern, ymd);
}
