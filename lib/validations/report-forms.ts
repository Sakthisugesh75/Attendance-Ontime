import { z } from "zod";

/**
 * Daily report forms. A form keeps the built-in sections (tasks, summary, tomorrow's plan,
 * blockers; each can be switched off or renamed) and adds custom fields. Answers to custom
 * fields are stored on the report with the label and type they had when sent.
 * Pure: shared by the form editor, the report composer and the server.
 */

export const FIELD_TYPES = ["text", "textarea", "number", "select", "yesno", "date"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  select: "Pick from a list",
  yesno: "Yes / No",
  date: "Date",
};
export const MAX_FIELDS = 20;

const section = z.object({ on: z.boolean(), label: z.string().trim().min(1, "Give the section a name").max(60) });
export const sectionsSchema = z.object({
  tasks: z.boolean(),
  summary: section,
  tomorrowPlan: section,
  blockers: section,
});
export type FormSections = z.output<typeof sectionsSchema>;

export const fieldSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{4,16}$/),
    label: z.string().trim().min(1, "Every field needs a label").max(80, "Keep labels under 80 characters"),
    type: z.enum(FIELD_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    hint: z.string().trim().max(120).default(""),
  })
  .superRefine((f, ctx) => {
    if (f.type === "select" && f.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: `"${f.label}" needs at least two choices` });
  });
export type FormField = z.output<typeof fieldSchema>;

export const reportFormSchema = z.object({
  name: z.string().trim().min(2, "Give the form a name").max(80),
  sections: sectionsSchema,
  fields: z.array(fieldSchema).max(MAX_FIELDS, `At most ${MAX_FIELDS} fields`),
  designationIds: z.array(z.number().int().positive()).max(200),
  departmentIds: z.array(z.number().int().positive()).max(200),
});
export type ReportFormInput = z.input<typeof reportFormSchema>;

/** What the composer needs to know about the form for this person. */
export interface ReportForm {
  id: number | null;
  name: string;
  sections: FormSections;
  fields: FormField[];
}

export const DEFAULT_SECTIONS: FormSections = {
  tasks: true,
  summary: { on: true, label: "Summary" },
  tomorrowPlan: { on: true, label: "Plan for tomorrow" },
  blockers: { on: true, label: "Blockers" },
};
export const STANDARD_FORM: ReportForm = { id: null, name: "Standard report", sections: DEFAULT_SECTIONS, fields: [] };

/** Reads a stored form defensively (bad JSON falls back to the defaults). */
export function readForm(row: { id: number; name: string; sections: unknown; fields: unknown }): ReportForm {
  const s = sectionsSchema.safeParse(row.sections);
  const fields = Array.isArray(row.fields) ? row.fields.flatMap((f) => (fieldSchema.safeParse(f).success ? [fieldSchema.parse(f)] : [])) : [];
  return { id: row.id, name: row.name, sections: s.success ? s.data : DEFAULT_SECTIONS, fields };
}

export const idList = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0) : []);

/** Which form applies: one naming the designation, else the department, else the default. */
export function pickForm<T extends { isDefault: boolean; designationIds: number[]; departmentIds: number[] }>(forms: T[], designationId: number | null, departmentId: number | null): T | null {
  return (
    (designationId ? forms.find((f) => f.designationIds.includes(designationId)) : undefined) ??
    (departmentId ? forms.find((f) => f.departmentIds.includes(departmentId)) : undefined) ??
    forms.find((f) => f.isDefault) ??
    null
  );
}

// ---- Answers ----------------------------------------------------------------

export type AnswerValue = string | number | boolean | null;
export const answerInput = z.array(z.object({ id: z.string().max(16), value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]) })).max(MAX_FIELDS);
export interface Answer {
  id: string;
  label: string;
  type: FieldType;
  value: AnswerValue;
}

const empty = (v: AnswerValue) => v === null || v === "" || (typeof v === "number" && !Number.isFinite(v));

/**
 * Checks answers against the form's fields. Returns the stored answers (with labels) or the
 * first problem, as { fieldId, message }.
 */
export function checkAnswers(fields: FormField[], given: { id: string; value: AnswerValue }[]): { ok: true; answers: Answer[] } | { ok: false; fieldId: string; message: string } {
  const byId = new Map(given.map((a) => [a.id, a.value]));
  const answers: Answer[] = [];
  for (const f of fields) {
    let v = byId.get(f.id) ?? null;
    if (typeof v === "string") v = v.trim();
    if (empty(v)) {
      if (f.required) return { ok: false, fieldId: f.id, message: `Fill in "${f.label}"` };
      continue;
    }
    switch (f.type) {
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return { ok: false, fieldId: f.id, message: `"${f.label}" must be a number` };
        v = n;
        break;
      }
      case "yesno":
        if (typeof v !== "boolean") v = v === "yes" || v === "true";
        break;
      case "select":
        if (!f.options.includes(String(v))) return { ok: false, fieldId: f.id, message: `Pick one of the choices for "${f.label}"` };
        v = String(v);
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return { ok: false, fieldId: f.id, message: `"${f.label}" needs a date` };
        v = String(v);
        break;
      default:
        v = String(v).slice(0, f.type === "text" ? 300 : 2000);
    }
    answers.push({ id: f.id, label: f.label, type: f.type, value: v });
  }
  return { ok: true, answers };
}

/** Stored answers, read defensively. */
export function parseAnswers(value: unknown): Answer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a): Answer[] => {
    if (!a || typeof a !== "object") return [];
    const o = a as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.label !== "string" || !(FIELD_TYPES as readonly string[]).includes(o.type as string)) return [];
    const v = o.value;
    return [{ id: o.id, label: o.label, type: o.type as FieldType, value: typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null }];
  });
}

/** Display text for an answer. */
export function answerText(a: Pick<Answer, "type" | "value">): string {
  if (a.value === null) return "—";
  if (a.type === "yesno") return a.value ? "Yes" : "No";
  if (a.type === "date" && typeof a.value === "string") {
    const [y, m, d] = a.value.split("-");
    return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y}`;
  }
  return String(a.value);
}

/** A short random id for a new field. */
export const newFieldId = () => Math.random().toString(36).slice(2, 10).padEnd(6, "x");
