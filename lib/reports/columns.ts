import type { ReportColumn } from "./types";

/** Columns of the expense claims export (also listed in Settings → Export format). */
export const EXPENSE_COLUMNS: ReportColumn[] = [
  { key: "name", label: "Employee", kind: "text" },
  { key: "code", label: "Code", kind: "code" },
  { key: "designation", label: "Designation", kind: "text" },
  { key: "date", label: "Date", kind: "date" },
  { key: "category", label: "Category", kind: "text" },
  { key: "description", label: "What for", kind: "text" },
  { key: "amount", label: "Amount", kind: "money" },
  { key: "status", label: "Status", kind: "text" },
  { key: "approvedBy", label: "Approved by", kind: "text" },
  { key: "paidOn", label: "Paid on", kind: "date" },
  { key: "paymentRef", label: "Payment ref", kind: "text" },
];
