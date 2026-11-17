import type { AttendanceStatus } from "@prisma/client";
import { Briefcase, CircleCheck, CircleDotDashed, CircleX, ClockAlert, House, Moon, PartyPopper, Timer, TreePalm, TriangleAlert, UserX, type LucideIcon } from "lucide-react";

/**
 * Label, letter code, icon and colour classes for every status (DESIGN.md §2.4). A status is
 * never shown by colour alone: pair the colour with its icon and label (or `short` in grids).
 * Tailwind needs literal class names, so each status spells its classes out in full.
 *
 * WFH and On duty use the Present palette (they are worked days), Permission uses the Leave
 * palette and Missing punch-out the Absent palette; their icons and codes tell them apart.
 */
export const STATUS_META: Record<AttendanceStatus, { label: string; short: string; icon: LucideIcon; dot: string; chip: string; cell: string }> = {
  PRESENT: { label: "Present", short: "P", icon: CircleCheck, dot: "bg-st-present", chip: "bg-st-present-tint text-st-present-fg ring-transparent", cell: "bg-st-present-tint text-st-present-fg" },
  LATE: { label: "Late", short: "L", icon: ClockAlert, dot: "bg-st-late", chip: "bg-st-late-tint text-st-late-fg ring-transparent", cell: "bg-st-late-tint text-st-late-fg" },
  HALF_DAY: { label: "Half day", short: "H", icon: CircleDotDashed, dot: "bg-st-halfday", chip: "bg-st-halfday-tint text-st-halfday-fg ring-transparent", cell: "bg-st-halfday-tint text-st-halfday-fg" },
  ABSENT: { label: "Absent", short: "A", icon: CircleX, dot: "bg-st-absent", chip: "bg-st-absent-tint text-st-absent-fg ring-transparent", cell: "bg-st-absent-tint text-st-absent-fg" },
  LEAVE: { label: "Leave", short: "LV", icon: TreePalm, dot: "bg-st-leave", chip: "bg-st-leave-tint text-st-leave-fg ring-transparent", cell: "bg-st-leave-tint text-st-leave-fg" },
  WFH: { label: "WFH", short: "WFH", icon: House, dot: "bg-st-present", chip: "bg-st-present-tint text-st-present-fg ring-transparent", cell: "bg-st-present-tint text-st-present-fg" },
  ON_DUTY: { label: "On duty", short: "OD", icon: Briefcase, dot: "bg-st-present", chip: "bg-st-present-tint text-st-present-fg ring-transparent", cell: "bg-st-present-tint text-st-present-fg" },
  PERMISSION: { label: "Permission", short: "PR", icon: Timer, dot: "bg-st-leave", chip: "bg-st-leave-tint text-st-leave-fg ring-transparent", cell: "bg-st-leave-tint text-st-leave-fg" },
  HOLIDAY: { label: "Holiday", short: "HO", icon: PartyPopper, dot: "bg-st-holiday", chip: "bg-st-holiday-tint text-st-holiday-fg ring-transparent", cell: "bg-st-holiday-tint text-st-holiday-fg" },
  WEEKLY_OFF: { label: "Weekly off", short: "WO", icon: Moon, dot: "bg-st-weeklyoff", chip: "bg-st-weeklyoff-tint text-st-weeklyoff-fg ring-transparent", cell: "bg-st-weeklyoff-tint text-st-weeklyoff-fg" },
  MISSING_PUNCH_OUT: { label: "Missing punch-out", short: "M", icon: TriangleAlert, dot: "bg-st-absent", chip: "bg-st-absent-tint text-st-absent-fg ring-transparent", cell: "bg-st-absent-tint text-st-absent-fg" },
  NOT_JOINED: { label: "Not joined", short: "", icon: UserX, dot: "bg-ink-3/40", chip: "bg-sunken text-ink-3 ring-transparent", cell: "text-ink-3/50" },
  EXITED: { label: "Exited", short: "", icon: UserX, dot: "bg-ink-3/40", chip: "bg-sunken text-ink-3 ring-transparent", cell: "text-ink-3/50" },
};
