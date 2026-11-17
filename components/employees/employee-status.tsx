import type { EmployeeStatus } from "@prisma/client";
import { Ban, CalendarClock, CircleCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMPLOYEE_STATUS_LABEL } from "@/lib/validations/employee";

/** Employment status as a pill (DESIGN.md §4.4): icon + word on a tint, never colour alone. */
const TONE: Record<EmployeeStatus, { cls: string; icon: LucideIcon }> = {
  ACTIVE: { cls: "bg-st-present-tint text-st-present-fg", icon: CircleCheck },
  ON_NOTICE: { cls: "bg-st-late-tint text-st-late-fg", icon: CalendarClock },
  EXITED: { cls: "bg-sunken text-ink-2", icon: Ban },
};

export function EmployeeStatusBadge({ status, className }: { status: EmployeeStatus; className?: string }) {
  const { cls, icon: Icon } = TONE[status];
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-caption font-semibold whitespace-nowrap", cls, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {EMPLOYEE_STATUS_LABEL[status]}
    </span>
  );
}
