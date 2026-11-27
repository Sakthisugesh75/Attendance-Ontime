import { Archive, PackageCheck, UserRound, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSET_STATUS_META, type AssetStatusKey } from "@/lib/validations/assets";

const ICON: Record<AssetStatusKey, LucideIcon> = { AVAILABLE: PackageCheck, ASSIGNED: UserRound, REPAIR: Wrench, RETIRED: Archive };

export function AssetStatusChip({ status, className }: { status: AssetStatusKey; className?: string }) {
  const Icon = ICON[status];
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-xs font-semibold whitespace-nowrap", ASSET_STATUS_META[status].chip, className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {ASSET_STATUS_META[status].label}
    </span>
  );
}
