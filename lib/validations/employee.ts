import { z } from "zod";
import { istDate } from "@/lib/time";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalYmd = z.union([ymd, z.literal("")]);

/** "+91 98765 43210" / "098765-43210" -> "9876543210" */
export const normalizePhone = (v: string) => v.replace(/\D/g, "").replace(/^(?:91|0)(?=\d{10}$)/, "");

/** Whole years from `from` to `to` (both "YYYY-MM-DD"): an age or years of service. */
export function completedYears(from: string, to: string): number {
  const years = Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  return to.slice(5) < from.slice(5) ? years - 1 : years;
}

export const MIN_AGE = 14;
export const MAX_AGE = 100;

/** Shared by the employee form (client) and the create/update actions (server). */
export const employeeSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the full name").max(150),
    phone: z.preprocess(
      (v) => (typeof v === "string" ? normalizePhone(v) : v),
      z.union([z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"), z.literal("")]),
    ),
    email: z.union([z.string().trim().toLowerCase().email("Enter a valid email").max(191), z.literal("")]),
    /** Optional; shown on the profile and used for birthday wishes. */
    dateOfBirth: optionalYmd.default(""),
    department: z.string().trim().max(100),
    designation: z.string().trim().max(100),
    joiningDate: ymd,
    exitDate: optionalYmd,
    status: z.enum(["ACTIVE", "ON_NOTICE", "EXITED"]),
    managerId: z.number().int().positive().nullable(),
    /** Daily report: follow the sign-in role, or always / never for this person. */
    reportRequired: z.enum(["ROLE", "YES", "NO"]).default("ROLE"),
    shiftId: z.number().int().positive({ message: "Pick a shift" }),
    /** On edit: when a changed shift starts. Ignored on create (the joining date is used). */
    shiftEffectiveFrom: optionalYmd,
    login: z.object({
      enabled: z.boolean(),
      /** Access role for the sign-in (null = the built-in Employee role). */
      accessRoleId: z.number().int().positive().nullable(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.dateOfBirth) {
      const today = istDate();
      const age = completedYears(v.dateOfBirth, today);
      if (v.dateOfBirth >= today) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Date of birth must be in the past" });
      else if (age < MIN_AGE) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: `They must be at least ${MIN_AGE} years old` });
      else if (age > MAX_AGE) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: `Check the year: that makes them over ${MAX_AGE}` });
    }
    if (v.exitDate && v.exitDate < v.joiningDate) ctx.addIssue({ code: "custom", path: ["exitDate"], message: "Exit date can't be before the joining date" });
    if (v.status === "EXITED" && !v.exitDate) ctx.addIssue({ code: "custom", path: ["exitDate"], message: "Set the exit date for an exited employee" });
    if (v.status === "ON_NOTICE" && !v.exitDate) ctx.addIssue({ code: "custom", path: ["exitDate"], message: "Set the last working day for someone on notice" });
    if (v.login.enabled && !v.email && !v.phone) ctx.addIssue({ code: "custom", path: ["email"], message: "Add an email or phone so they can sign in" });
  });

export type EmployeeInput = z.input<typeof employeeSchema>;
export type EmployeeValues = z.output<typeof employeeSchema>;

export const EMPLOYEE_STATUS_LABEL = { ACTIVE: "Active", ON_NOTICE: "On notice", EXITED: "Exited" } as const;

export const employeeListParams = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(["ALL", "ACTIVE", "ON_NOTICE", "EXITED"]).catch("ALL"),
  department: z.coerce.number().int().positive().optional().catch(undefined),
  sort: z.enum(["name", "code", "joined"]).catch("name"),
  dir: z.enum(["asc", "desc"]).catch("asc"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type EmployeeListParams = z.infer<typeof employeeListParams>;
