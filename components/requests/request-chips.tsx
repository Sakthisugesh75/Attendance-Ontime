import { Ban, CircleCheck, CircleX, Hourglass, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS_META, REQUEST_TYPE_META, type RequestStatusKey, type RequestTypeKey } from "@/lib/validations/requests";

const base = "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap ring-1 ring-inset";

const STATUS_ICON: Record<RequestStatusKey, LucideIcon> = {
  PENDING: Hourglass,
  APPROVED: CircleCheck,
  REJECTED: CircleX,
  CANCELLED: Ban,
  CANCEL_REQUESTED: Hourglass,
};

export function RequestTypeChip({ type, label, className }: { type: RequestTypeKey; label?: string; className?: string }) {
  const meta = REQUEST_TYPE_META[type];
  return (
    <span className={cn(base, meta.chip, className)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {label ?? meta.short}
    </span>
  );
}

/** Icon + word; Pending is the dashed one (DESIGN.md §2.4). */
export function RequestStatusChip({ status, className }: { status: RequestStatusKey; className?: string }) {
  const meta = REQUEST_STATUS_META[status];
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn(base, "pl-1.5", meta.chip, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {meta.label}
    </span>
  );
}
