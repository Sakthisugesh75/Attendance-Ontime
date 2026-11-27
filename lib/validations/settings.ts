import { z } from "zod";
import {
  SATURDAY_POLICIES,
  type WeeklyOffPattern,
} from "@/lib/attendance/weekly-off";

/**
 * Settings schemas shared by the settings forms (client) and the settings actions (server),
 * plus the pure helpers behind them (weekly-off presets, leave allocation).
 */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const minutes = (label: string, max = 1440) =>
  z.coerce
    .number({ invalid_type_error: `Enter ${label}` })
    .int(`${label} must be whole minutes`)
    .min(0, `${label} can't be negative`)
    .max(max, `${label} is too large`);

// ---- Stored settings (CompanySetting rows) -----------------------------------

export const companySchema = z.object({
  name: z.string().trim().min(1, "Enter the company name").max(150),
  address: z.string().trim().max(500),
  logoPath: z.string().nullable(),
});

/** How Excel / PDF exports look: letterhead, notes, signature lines and hidden columns per report. */
export const exportFormatSchema = z.object({
  showLogo: z.boolean(),
  showAddress: z.boolean(),
  /** Line under the title, e.g. "Confidential: for payroll use only" */
  headerNote: z.string().trim().max(200, "Keep the note under 200 characters"),
  /** Small print at the bottom of each PDF page and under the Excel table */
  footerNote: z.string().trim().max(300, "Keep the note under 300 characters"),
  /** Signature lines at the end, e.g. "Prepared by", "Approved by" */
  signatures: z.array(z.string().trim().min(1, "Enter a label or remove the line").max(40, "At most 40 characters")).max(4, "At most 4 signature lines"),
  pdfOrientation: z.enum(["landscape", "portrait"]),
  /** Report key → column keys left out of exports (the first column is always kept) */
  hiddenColumns: z.record(z.string().max(40), z.array(z.string().max(40)).max(60)),
});
export type ExportFormat = z.output<typeof exportFormatSchema>;

export const geofenceSchema = z.object({
  enabled: z.boolean(),
  lat: z.coerce
    .number({ invalid_type_error: "Enter a latitude" })
    .min(-90, "Latitude is between -90 and 90")
    .max(90, "Latitude is between -90 and 90"),
  lng: z.coerce
    .number({ invalid_type_error: "Enter a longitude" })
    .min(-180, "Longitude is between -180 and 180")
    .max(180, "Longitude is between -180 and 180"),
  radiusMeters: z.coerce
    .number({ invalid_type_error: "Enter a radius" })
    .int("Whole metres only")
    .min(20, "At least 20 m")
    .max(5000, "At most 5,000 m"),
});

export const punchSchema = z.object({
  selfieRequired: z.boolean(),
});

export const capsSchema = z.object({
  wfhPerMonth: z.coerce
    .number({ invalid_type_error: "Enter a number" })
    .int("Whole days only")
    .min(0, "Can't be negative")
    .max(31, "At most 31"),
  permissionPerMonth: z.coerce
    .number({ invalid_type_error: "Enter a number" })
    .int("Whole numbers only")
    .min(0, "Can't be negative")
    .max(31, "At most 31"),
  permissionMaxMinutes: z.coerce
    .number({ invalid_type_error: "Enter minutes" })
    .int("Whole minutes only")
    .min(15, "At least 15 minutes")
    .max(480, "At most 480 minutes"),
});

// ---- Form inputs ----------------------------------------------------------------

/** Company form: the logo has its own upload action. */
export const companyFormSchema = companySchema.omit({ logoPath: true });
export type CompanyFormInput = z.input<typeof companyFormSchema>;

export const punchingFormSchema = z.object({
  geofence: geofenceSchema,
  punch: punchSchema,
});
export type PunchingFormInput = z.input<typeof punchingFormSchema>;
export type CapsFormInput = z.input<typeof capsSchema>;

export const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const MAX_LOGO_BYTES = 1024 * 1024;

// ---- Weekly offs -----------------------------------------------------------------

export type SaturdayPolicy = keyof typeof SATURDAY_POLICIES;
export const SATURDAY_POLICY_KEYS = Object.keys(
  SATURDAY_POLICIES,
) as SaturdayPolicy[];

export const weeklyOffSchema = z.object({
  saturday: z.enum(
    SATURDAY_POLICY_KEYS as [SaturdayPolicy, ...SaturdayPolicy[]],
  ),
  sundayOff: z.boolean(),
  effectiveFrom: ymd,
});
export type WeeklyOffInput = z.infer<typeof weeklyOffSchema>;

/** A weekly-off policy for one department or designation ("company" = follow the company policy again). */
export const groupWeeklyOffSchema = z.object({
  target: z.enum(["department", "designation"]),
  targetId: z.coerce.number({ invalid_type_error: "Pick who it's for" }).int().positive("Pick who it's for"),
  mode: z.enum(["custom", "company"]),
  saturday: z.enum(SATURDAY_POLICY_KEYS as [SaturdayPolicy, ...SaturdayPolicy[]]),
  sundayOff: z.boolean(),
  effectiveFrom: ymd,
});
export type GroupWeeklyOffInput = z.infer<typeof groupWeeklyOffSchema>;

export const customDateSchema = z.object({
  date: ymd,
  kind: z.enum(["OFF", "WORK"]),
});
export type CustomDateInput = z.infer<typeof customDateSchema>;

/** Pattern for a Saturday preset with Sunday on or off. */
export function buildPattern(
  saturday: SaturdayPolicy,
  sundayOff: boolean,
): WeeklyOffPattern {
  const sat = (SATURDAY_POLICIES[saturday].pattern as WeeklyOffPattern)["6"];
  const pattern: WeeklyOffPattern = {};
  if (sundayOff) pattern["0"] = "ALL";
  if (sat) pattern["6"] = Array.isArray(sat) ? [...sat] : sat;
  return pattern;
}

/** The preset a stored pattern corresponds to, or null for anything custom (other weekdays, other weeks). */
export function detectPolicy(
  pattern: WeeklyOffPattern,
): { saturday: SaturdayPolicy; sundayOff: boolean } | null {
  const keys = Object.keys(pattern).filter((k) => pattern[k] !== undefined);
  if (keys.some((k) => k !== "0" && k !== "6")) return null;
  const sun = pattern["0"];
  if (sun !== undefined && sun !== "ALL") return null;
  const sat = pattern["6"];
  const satKey = JSON.stringify(
    sat === undefined
      ? null
      : Array.isArray(sat)
        ? [...sat].sort((a, b) => a - b)
        : sat,
  );
  const saturday = SATURDAY_POLICY_KEYS.find((k) => {
    const p = (SATURDAY_POLICIES[k].pattern as WeeklyOffPattern)["6"];
    return JSON.stringify(p === undefined ? null : p) === satKey;
  });
  return saturday ? { saturday, sundayOff: sun === "ALL" } : null;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

/** Human label for a pattern, e.g. "Sunday + 2nd & 4th Saturday off". */
export function describePattern(pattern: WeeklyOffPattern): string {
  const known = detectPolicy(pattern);
  if (known) {
    const sat = {
      ALL_WORKING: "",
      ALL_OFF: "all Saturdays",
      ALT_1_3: "1st & 3rd Saturday",
      ALT_2_4: "2nd & 4th Saturday",
    }[known.saturday];
    const parts = [known.sundayOff ? "Sunday" : "", sat].filter(Boolean);
    return parts.length ? `${parts.join(" + ")} off` : "No weekly off";
  }
  const parts = Object.entries(pattern)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([d, v]) =>
      v === "ALL"
        ? `every ${WEEKDAY_SHORT[Number(d)]}`
        : `${(v as number[]).map((n) => ORDINAL[n] ?? `${n}th`).join(" & ")} ${WEEKDAY_SHORT[Number(d)]}`,
    );
  return parts.length ? `${parts.join(", ")} off` : "No weekly off";
}

// ---- Shifts ------------------------------------------------------------------------

export const shiftDaySchema = z.object({
  enabled: z.boolean(),
  startTime: hhmm,
  endTime: hhmm,
  /** Empty = use the shift's full-day minutes */
  fullDayMinutes: z.union([
    z.literal(""),
    z.coerce
      .number()
      .int("Whole minutes")
      .min(30, "At least 30 minutes")
      .max(1440),
  ]),
});

export const shiftSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(100),
    isDefault: z.boolean(),
    graceMinutes: minutes("Grace", 240),
    fullDayMinutes: minutes("Full-day minutes").pipe(
      z.number().min(30, "At least 30 minutes"),
    ),
    halfDayMinutes: minutes("Half-day minutes").pipe(
      z.number().min(15, "At least 15 minutes"),
    ),
    earlyLeaveMinutes: minutes("Early-leave threshold", 480),
    overtimeAfterMinutes: minutes("Overtime threshold", 480),
    /** Index = weekday, 0 = Sunday … 6 = Saturday */
    days: z.array(shiftDaySchema).length(7),
  })
  .superRefine((v, ctx) => {
    if (v.halfDayMinutes >= v.fullDayMinutes)
      ctx.addIssue({
        code: "custom",
        path: ["halfDayMinutes"],
        message: "Half day must be shorter than a full day",
      });
    if (!v.days.some((d) => d.enabled))
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Turn on at least one working day",
      });
    v.days.forEach((d, i) => {
      if (d.enabled && d.endTime <= d.startTime)
        ctx.addIssue({
          code: "custom",
          path: ["days", i, "endTime"],
          message: "Ends before it starts",
        });
    });
  });
export type ShiftInput = z.input<typeof shiftSchema>;
export type ShiftValues = z.output<typeof shiftSchema>;

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Collapses per-weekday timings into runs with the same hours, Monday first:
 * Mon–Fri 09:30–18:30, Sat 09:30–17:30.
 */
export function groupShiftDays(
  days: {
    weekday: number;
    startTime: string;
    endTime: string;
    fullDayMinutes: number | null;
  }[],
) {
  const byDay = new Map(days.map((d) => [d.weekday, d]));
  const groups: {
    from: number;
    to: number;
    startTime: string;
    endTime: string;
    fullDayMinutes: number | null;
  }[] = [];
  for (const wd of DAY_ORDER) {
    const d = byDay.get(wd);
    if (!d) continue;
    const last = groups.at(-1);
    const prevIdx = last ? DAY_ORDER.indexOf(last.to) : -2;
    if (
      last &&
      DAY_ORDER.indexOf(wd) === prevIdx + 1 &&
      last.startTime === d.startTime &&
      last.endTime === d.endTime &&
      last.fullDayMinutes === d.fullDayMinutes
    ) {
      last.to = wd;
    } else {
      groups.push({
        from: wd,
        to: wd,
        startTime: d.startTime,
        endTime: d.endTime,
        fullDayMinutes: d.fullDayMinutes,
      });
    }
  }
  return groups.map((g) => ({
    ...g,
    label:
      g.from === g.to
        ? WEEKDAY_SHORT[g.from]!
        : `${WEEKDAY_SHORT[g.from]}–${WEEKDAY_SHORT[g.to]}`,
  }));
}

// ---- Leave types --------------------------------------------------------------------

const leaveDays = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `Enter ${label}` })
    .min(0, `${label} can't be negative`)
    .max(365, `${label} is too large`)
    .refine((n) => Number.isInteger(n * 2), "Use whole or half days");

export const leaveTypeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Enter a short code")
      .max(10, "At most 10 characters")
      .regex(/^[A-Z0-9_-]+$/, "Letters and digits only"),
    name: z.string().trim().min(2, "Enter a name").max(50),
    yearlyQuota: leaveDays("Quota"),
    isPaid: z.boolean(),
    carryForward: z.boolean(),
    maxCarryForward: leaveDays("Max carry forward"),
    isActive: z.boolean(),
    /** Designations allowed to use it; empty = everyone */
    designationIds: z.array(z.number().int().positive()).max(200).default([]),
  })
  .transform((v) => ({
    ...v,
    maxCarryForward: v.carryForward ? v.maxCarryForward : 0,
  }));
export type LeaveTypeInput = z.input<typeof leaveTypeSchema>;

/** A custom yearly quota: one leave type, for a designation ("role") or one employee. Form shape. */
export const quotaRuleFormSchema = z.object({
  leaveTypeId: z.coerce
    .number({ invalid_type_error: "Pick a leave type" })
    .int()
    .positive("Pick a leave type"),
  appliesTo: z.enum(["designation", "employee"]),
  targetId: z.coerce
    .number({ invalid_type_error: "Pick who it's for" })
    .int()
    .positive("Pick who it's for"),
  yearlyQuota: leaveDays("Quota"),
});
/** Server shape: exactly one of designationId / employeeId. */
export const quotaRuleSchema = quotaRuleFormSchema.transform((v) => ({
  leaveTypeId: v.leaveTypeId,
  designationId: v.appliesTo === "designation" ? v.targetId : null,
  employeeId: v.appliesTo === "employee" ? v.targetId : null,
  yearlyQuota: v.yearlyQuota,
}));
export type QuotaRuleInput = z.infer<typeof quotaRuleFormSchema>;

export const allocateYearSchema = z.coerce.number().int().min(2000).max(2100);

/** What an employee gets for a leave type in a year, given last year's balance. */
export function allocationFor(
  type: { yearlyQuota: number; carryForward: boolean; maxCarryForward: number },
  previous: { allotted: number; carriedForward: number; used: number } | null,
): { allotted: number; carriedForward: number } {
  const unused = previous
    ? Math.max(0, previous.allotted + previous.carriedForward - previous.used)
    : 0;
  return {
    allotted: type.yearlyQuota,
    carriedForward: type.carryForward
      ? Math.min(unused, type.maxCarryForward)
      : 0,
  };
}

// ---- Departments & designations -----------------------------------------------------

export const lookupKindSchema = z.enum(["department", "designation"]);
export type LookupKind = z.infer<typeof lookupKindSchema>;
export const lookupNameSchema = z
  .string()
  .trim()
  .min(2, "At least 2 characters")
  .max(100);

// ---- Navigation ------------------------------------------------------------------------

export const SETTINGS_TABS = [
  { key: "company", label: "Company" },
  { key: "working-week", label: "Working week" },
  { key: "shifts", label: "Shifts" },
  { key: "leave-types", label: "Leave types" },
  { key: "policies", label: "Policies" },
  { key: "punching", label: "Punching" },
  { key: "organisation", label: "Departments" },
  { key: "report-forms", label: "Report forms" },
  { key: "exports", label: "Export format" },
  { key: "backup", label: "Backup" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];
export const settingsTabSchema = z
  .enum(SETTINGS_TABS.map((t) => t.key) as [SettingsTab, ...SettingsTab[]])
  .catch("company");
