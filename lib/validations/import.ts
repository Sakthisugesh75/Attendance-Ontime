import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/** What the admin chose on the preview screen. Shared by the review form and the commit action. */
export const commitImportSchema = z
  .object({
    people: z
      .array(
        z.object({
          key: z.string().min(1).max(200),
          action: z.enum(["match", "create", "skip"]),
          employeeId: z.number().int().positive().nullable(),
          fullName: z.string().trim().max(150),
          department: z.string().trim().max(100),
          joiningDate: z.union([ymd, z.literal("")]),
          exitDate: z.union([ymd, z.literal("")]),
          status: z.enum(["ACTIVE", "ON_NOTICE", "EXITED"]),
        }),
      )
      .min(1),
    /** Existing days that already have punches or remarks: keep them, or replace them with the sheet's values. */
    strategy: z.enum(["skip", "overwrite"]),
    holidays: z.array(z.object({ date: ymd, name: z.string().trim().min(1).max(150) })),
    /** Apply the sheet's extra off days (e.g. a Saturday the current rule treats as working). */
    extraOffDays: z.array(ymd),
  })
  .superRefine((v, ctx) => {
    v.people.forEach((p, i) => {
      if (p.action === "match" && !p.employeeId) ctx.addIssue({ code: "custom", path: ["people", i, "employeeId"], message: "Pick the employee to match" });
      if (p.action === "create") {
        if (p.fullName.length < 2) ctx.addIssue({ code: "custom", path: ["people", i, "fullName"], message: "Enter the name" });
        if (!p.joiningDate) ctx.addIssue({ code: "custom", path: ["people", i, "joiningDate"], message: "Set the joining date" });
        if (p.exitDate && p.joiningDate && p.exitDate < p.joiningDate) ctx.addIssue({ code: "custom", path: ["people", i, "exitDate"], message: "Exit is before joining" });
        if (p.status !== "ACTIVE" && !p.exitDate) ctx.addIssue({ code: "custom", path: ["people", i, "exitDate"], message: "Set the exit date" });
      }
    });
    const matched = v.people.filter((p) => p.action === "match").map((p) => p.employeeId);
    if (new Set(matched).size !== matched.length) ctx.addIssue({ code: "custom", path: ["people"], message: "Two names are matched to the same employee. Match each employee once." });
  });

export type CommitImportInput = z.input<typeof commitImportSchema>;
