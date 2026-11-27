import { describe, expect, it } from "vitest";
import { claimLimit, claimSchema, formatRupees } from "@/lib/validations/expenses";
import { answerText, checkAnswers, parseAnswers, pickForm, reportFormSchema, type FormField } from "@/lib/validations/report-forms";

const fields: FormField[] = [
  { id: "visits01", label: "Clients visited", type: "number", required: true, options: [], hint: "" },
  { id: "lead0001", label: "Lead", type: "select", required: false, options: ["Hot", "Cold"], hint: "" },
  { id: "travel01", label: "Travelled", type: "yesno", required: false, options: [], hint: "" },
];

describe("report form answers", () => {
  it("requires required fields and types values", () => {
    expect(checkAnswers(fields, [])).toMatchObject({ ok: false, fieldId: "visits01" });
    const r = checkAnswers(fields, [
      { id: "visits01", value: "3" },
      { id: "travel01", value: true },
    ]);
    expect(r.ok && r.answers).toEqual([
      { id: "visits01", label: "Clients visited", type: "number", value: 3 },
      { id: "travel01", label: "Travelled", type: "yesno", value: true },
    ]);
  });

  it("rejects a choice that isn't offered and ignores unknown ids", () => {
    expect(checkAnswers(fields, [{ id: "visits01", value: 1 }, { id: "lead0001", value: "Lukewarm" }])).toMatchObject({ ok: false, fieldId: "lead0001" });
    const r = checkAnswers(fields, [{ id: "visits01", value: 1 }, { id: "zzzz", value: "x" }]);
    expect(r.ok && r.answers.map((a) => a.id)).toEqual(["visits01"]);
  });

  it("reads stored answers defensively and formats them", () => {
    expect(parseAnswers([{ id: "a", label: "A", type: "yesno", value: false }, { bad: 1 }, null])).toHaveLength(1);
    expect(answerText({ type: "yesno", value: false })).toBe("No");
    expect(answerText({ type: "date", value: "2026-11-27" })).toBe("27 Nov 2026");
  });

  it("a select field needs two choices", () => {
    const r = reportFormSchema.safeParse({ name: "X", sections: { tasks: true, summary: { on: true, label: "S" }, tomorrowPlan: { on: true, label: "T" }, blockers: { on: true, label: "B" } }, fields: [{ ...fields[1], options: ["Only"] }], designationIds: [], departmentIds: [] });
    expect(r.success).toBe(false);
  });
});

describe("pickForm", () => {
  const forms = [
    { name: "default", isDefault: true, designationIds: [], departmentIds: [] },
    { name: "sales", isDefault: false, designationIds: [], departmentIds: [7] },
    { name: "managers", isDefault: false, designationIds: [3], departmentIds: [] },
  ];
  it("prefers designation, then department, then default", () => {
    expect(pickForm(forms, 3, 7)?.name).toBe("managers");
    expect(pickForm(forms, 9, 7)?.name).toBe("sales");
    expect(pickForm(forms, null, null)?.name).toBe("default");
  });
});

describe("expenses", () => {
  const cat = { defaultLimit: 500, limits: [{ designationId: 2, maxAmount: 2000 }] };
  it("designation limit wins over the category limit", () => {
    expect(claimLimit(cat, 2)).toBe(2000);
    expect(claimLimit(cat, 5)).toBe(500);
    expect(claimLimit({ defaultLimit: null, limits: [] }, 5)).toBeNull();
  });
  it("validates amounts and formats rupees the Indian way", () => {
    expect(claimSchema.safeParse({ categoryId: 1, expenseDate: "2026-11-27", amount: "12.345", description: "Auto" }).success).toBe(false);
    expect(claimSchema.safeParse({ categoryId: 1, expenseDate: "2026-11-27", amount: "125000.5", description: "Laptop bag" }).success).toBe(true);
    expect(formatRupees(125000.5)).toBe("₹1,25,000.50");
  });
});
