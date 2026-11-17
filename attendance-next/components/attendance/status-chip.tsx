import type { AttendanceStatus } from "@prisma/client";
import { CircleDashed } from "lucide-react";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Status pill (DESIGN.md §4.4): icon + word on the status tint. Never colour alone. */
export function StatusChip({ status, label, className }: { status: AttendanceStatus | null; label?: string; className?: string }) {
  const meta = status ? STATUS_META[status] : null;
  const Icon = meta?.icon ?? CircleDashed;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        meta?.chip ?? "bg-sunken text-ink-2 ring-transparent",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label ?? meta?.label ?? "Not punched in"}
    </span>
  );
}
