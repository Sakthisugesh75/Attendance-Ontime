import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const hhmm = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"), z.literal("")]);
const reason = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500);

/** Statuses HR can set a day to (the rest are computed or about employment dates). */
export const OVERRIDE_STATUSES = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE", "WFH", "ON_DUTY", "PERMISSION", "HOLIDAY", "WEEKLY_OFF"] as const;
export type OverrideStatus = (typeof OVERRIDE_STATUSES)[number];

/** Edit one employee-day from the muster (shared by the sheet form and the server action). */
export const musterEditSchema = z
  .object({
    employeeId: z.number().int().positive(),
    date: ymd,
    punchIn: hhmm,
    punchOut: hhmm,
    status: z.union([z.literal("AUTO"), z.enum(OVERRIDE_STATUSES)]),
    remarks: z.string().trim().max(500),
    reason,
  })
  .superRefine((v, ctx) => {
    if (v.punchOut && !v.punchIn) ctx.addIssue({ code: "custom", path: ["punchIn"], message: "Add the punch-in time too" });
    if (v.punchIn && v.punchOut && v.punchOut <= v.punchIn) ctx.addIssue({ code: "custom", path: ["punchOut"], message: "Punch-out must be after punch-in" });
  });
export type MusterEditInput = z.input<typeof musterEditSchema>;

export const BULK_ACTIONS = ["PRESENT_SHIFT", ...OVERRIDE_STATUSES] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Mark many employees for one date. */
export const bulkMarkSchema = z
  .object({
    date: ymd,
    scope: z.enum(["ALL", "SELECTED"]),
    employeeIds: z.array(z.number().int().positive()).max(1000),
    action: z.enum(BULK_ACTIONS),
    reason,
  })
  .superRefine((v, ctx) => {
    if (v.scope === "SELECTED" && v.employeeIds.length === 0) ctx.addIssue({ code: "custom", path: ["employeeIds"], message: "Pick at least one employee" });
  });
export type BulkMarkInput = z.input<typeof bulkMarkSchema>;

/** Muster page URL params */
export const musterParams = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined),
  dept: z.coerce.number().int().positive().optional().catch(undefined),
  q: z.string().trim().max(100).catch(""),
});
