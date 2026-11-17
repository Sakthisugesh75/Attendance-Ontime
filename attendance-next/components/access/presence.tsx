import { Ban, CircleCheck, Hourglass, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIGN_IN_STATUS_LABEL, type SignInStatus } from "@/lib/validations/access";

/** Someone is using the app right now. Always shown next to the words "Online now". */
export function OnlineDot({ className }: { className?: string }) {
  return <span className={cn("inline-flex size-2.5 shrink-0 rounded-full bg-st-present ring-2 ring-surface", className)} aria-hidden />;
}

/** "Online now" or "last seen 12 min ago" / "never signed in". */
export function Presence({ online, lastSeenAgo, className }: { online: boolean; lastSeenAgo: string | null; className?: string }) {
  if (online)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-caption whitespace-nowrap text-st-present-fg", className)}>
        <OnlineDot /> Online now
      </span>
    );
  return <span className={cn("text-caption whitespace-nowrap text-ink-3", className)}>{lastSeenAgo ? `Last seen ${lastSeenAgo}` : "Never seen"}</span>;
}

/** Sign-in status pill (DESIGN.md §4.4): icon + word on a tint. Pending is dashed. */
const TONE: Record<SignInStatus, { cls: string; icon: LucideIcon }> = {
  ACTIVE: { cls: "bg-st-present-tint text-st-present-fg", icon: CircleCheck },
  PENDING: { cls: "border border-dashed border-st-pending bg-st-pending-tint text-st-pending-fg", icon: Hourglass },
  LOCKED: { cls: "bg-danger-subtle text-danger", icon: Lock },
  DISABLED: { cls: "bg-sunken text-ink-2", icon: Ban },
};

export function SignInStatusBadge({ status, lockedUntil, className }: { status: SignInStatus; lockedUntil?: string | null; className?: string }) {
  const { cls, icon: Icon } = TONE[status];
  return (
    <span className={cn("inline-flex flex-col items-start gap-0.5", className)}>
      <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-caption font-semibold whitespace-nowrap", cls)}>
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {SIGN_IN_STATUS_LABEL[status]}
      </span>
      {status === "LOCKED" && lockedUntil && <span className="text-caption whitespace-nowrap text-ink-3 tabular-nums">until {lockedUntil}</span>}
    </span>
  );
}
