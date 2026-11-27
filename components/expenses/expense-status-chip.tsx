import { Ban, Banknote, CircleCheck, CircleX, Hourglass, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXPENSE_STATUS_META, type ExpenseStatusKey } from "@/lib/validations/expenses";

const ICON: Record<ExpenseStatusKey, LucideIcon> = {
  PENDING_MANAGER: Hourglass,
  PENDING_HR: Hourglass,
  APPROVED: CircleCheck,
  PAID: Banknote,
  REJECTED: CircleX,
  CANCELLED: Ban,
};

/** Icon + word on the status tint; waiting states are dashed (DESIGN.md §2.4). */
export function ExpenseStatusChip({ status, className }: { status: ExpenseStatusKey; className?: string }) {
  const meta = EXPENSE_STATUS_META[status];
  const Icon = ICON[status];
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap", meta.chip, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {meta.label}
    </span>
  );
}
