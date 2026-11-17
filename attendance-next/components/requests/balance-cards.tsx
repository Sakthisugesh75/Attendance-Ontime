import { TreePalm } from "lucide-react";
import type { BalanceRow } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { fmtNum } from "@/lib/validations/requests";

/**
 * One stat card per leave type (DESIGN.md §4.6): available as the display figure, with a thin
 * bar for used (Leave solid) and pending (Pending solid) out of allotted + carried forward.
 * Unpaid types show what was taken.
 */
export function BalanceCards({ balances, compact = false }: { balances: BalanceRow[]; compact?: boolean }) {
  // Types with nothing allotted and nothing taken (e.g. comp-off before any is granted) stay hidden.
  const shown = balances.filter((b) => b.allotted + b.carriedForward > 0 || b.used > 0 || b.pending > 0);
  if (!shown.length) return null;
  const cols = shown.length >= 5 ? "lg:grid-cols-5" : shown.length === 4 ? "lg:grid-cols-4" : "";
  return (
    <ul className={cn("grid grid-cols-2 gap-3", compact ? "sm:grid-cols-3" : cn("sm:grid-cols-3", cols))} aria-label="Leave balances">
      {shown.map((b) => (
        <li key={b.leaveTypeId}>
          <BalanceTile b={b} compact={compact} />
        </li>
      ))}
    </ul>
  );
}

function BalanceTile({ b, compact }: { b: BalanceRow; compact: boolean }) {
  const total = b.allotted + b.carriedForward;
  const pct = (n: number) => (total > 0 ? Math.min(100, Math.max(0, (n / total) * 100)) : 0);
  return (
    <div className={cn("flex h-full flex-col rounded-xl bg-surface shadow-card", compact ? "p-3" : "p-4")} data-testid={`balance-${b.code}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-label text-ink-2" title={b.name}>
          <span className="line-clamp-2">{b.name}</span>
          <span className="mt-0.5 block text-caption text-ink-3 [font-feature-settings:'zero']">{b.code}</span>
        </p>
        {!compact && (
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-st-leave-tint text-st-leave-fg">
            <TreePalm className="size-4" />
          </span>
        )}
      </div>
      {b.isPaid ? (
        <>
          <p className={cn("mt-auto pt-3 text-ink tabular-nums", compact ? "text-title-1" : "text-display", b.available <= 0 && "text-ink-3")}>
            <span data-testid="available">{fmtNum(b.available)}</span>
            <span className="ml-1.5 text-caption font-medium tracking-normal text-ink-3">available</span>
          </p>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <span className="h-full bg-st-leave" style={{ width: `${pct(b.used)}%` }} />
            <span className="h-full bg-st-pending" style={{ width: `${pct(b.pending)}%` }} />
          </div>
          <p className="mt-2 text-caption text-ink-3 tabular-nums">
            {fmtNum(b.used)} used
            {b.pending > 0 && <> · {fmtNum(b.pending)} pending</>} · of {fmtNum(total)}
            {b.carriedForward > 0 && !compact && <span className="block">incl. {fmtNum(b.carriedForward)} carried forward</span>}
            {b.carryLimit !== null && !compact && b.available > 0 && (
              <span className="block" data-testid="carry-next">
                Up to {fmtNum(Math.min(b.available, b.carryLimit))} carr{Math.min(b.available, b.carryLimit) === 1 ? "ies" : "y"} into next year if not taken
              </span>
            )}
          </p>
        </>
      ) : (
        <>
          <p className={cn("mt-auto pt-3 text-ink tabular-nums", compact ? "text-title-1" : "text-display")}>
            {fmtNum(b.used)}
            <span className="ml-1.5 text-caption font-medium tracking-normal text-ink-3">taken</span>
          </p>
          <p className="mt-2 text-caption text-ink-3 tabular-nums">Unpaid · no limit{b.pending > 0 ? ` · ${fmtNum(b.pending)} pending` : ""}</p>
        </>
      )}
    </div>
  );
}
