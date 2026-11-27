import { z } from "zod";

/**
 * Expense claims: shared by the forms (client) and the actions (server).
 * Flow: PENDING_MANAGER (reporting manager) → PENDING_HR (expenses.manage) → APPROVED → PAID.
 * Someone without a reporting manager goes straight to PENDING_HR.
 */

export const EXPENSE_STATUSES = ["PENDING_MANAGER", "PENDING_HR", "APPROVED", "PAID", "REJECTED", "CANCELLED"] as const;
export type ExpenseStatusKey = (typeof EXPENSE_STATUSES)[number];

const PENDING_CHIP = "bg-st-pending-tint text-st-pending-fg outline outline-1 -outline-offset-1 outline-dashed outline-st-pending";

/** Pending = dashed (DESIGN.md §2.4); approved and paid share the Present palette and differ by icon and word. */
export const EXPENSE_STATUS_META: Record<ExpenseStatusKey, { label: string; chip: string; open: boolean }> = {
  PENDING_MANAGER: { label: "With manager", chip: PENDING_CHIP, open: true },
  PENDING_HR: { label: "With HR", chip: PENDING_CHIP, open: true },
  APPROVED: { label: "Approved · to pay", chip: "bg-st-present-tint text-st-present-fg", open: true },
  PAID: { label: "Paid", chip: "bg-st-present-tint text-st-present-fg", open: false },
  REJECTED: { label: "Rejected", chip: "bg-st-absent-tint text-st-absent-fg", open: false },
  CANCELLED: { label: "Cancelled", chip: "bg-sunken text-ink-3", open: false },
};

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_CLAIM = 10_00_000;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `Enter the ${label}` })
    .positive(`Enter the ${label}`)
    .max(MAX_CLAIM, `The ${label} is too large`)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimals");

export const claimSchema = z.object({
  categoryId: z.coerce.number({ invalid_type_error: "Pick a category" }).int().positive("Pick a category"),
  expenseDate: ymd,
  amount: money("amount"),
  description: z.string().trim().min(3, "Say what it was for").max(1000, "Keep it under 1000 characters"),
});
export type ClaimInput = z.input<typeof claimSchema>;

export const decisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    comment: z.string().trim().max(500, "Keep the comment under 500 characters").default(""),
  })
  .refine((v) => v.decision === "APPROVE" || v.comment.length >= 3, { message: "Say why it's rejected", path: ["comment"] });

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(60),
  defaultLimit: z.union([money("limit"), z.literal(""), z.null()]).transform((v) => (v === "" || v === null ? null : v)),
  receiptRequired: z.boolean(),
  isActive: z.boolean(),
  /** Per-designation limits: { designationId, maxAmount } */
  limits: z.array(z.object({ designationId: z.number().int().positive(), maxAmount: money("limit") })).max(200).default([]),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const expenseListParams = z.object({
  view: z.enum(["mine", "approvals", "categories"]).catch("mine"),
  status: z.enum(["OPEN", "ALL", ...EXPENSE_STATUSES]).catch("OPEN"),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
});
export type ExpenseListParams = z.infer<typeof expenseListParams>;

/** ₹1,25,000.50 */
export function formatRupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** The limit for one claim: the designation's limit wins over the category default; null = no limit. */
export function claimLimit(category: { defaultLimit: number | null; limits: { designationId: number; maxAmount: number }[] }, designationId: number | null): number | null {
  const own = designationId ? category.limits.find((l) => l.designationId === designationId) : undefined;
  return own ? own.maxAmount : category.defaultLimit;
}
