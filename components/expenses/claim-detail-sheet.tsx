"use client";

import { CircleAlert, Loader2, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cancelClaim, decideClaim } from "@/lib/actions/expenses";
import type { ClaimRow } from "@/lib/expenses";
import { formatDate, formatTime, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatRupees } from "@/lib/validations/expenses";
import { ExpenseStatusChip } from "./expense-status-chip";

export type DetailClaim = ClaimRow & { canDecide?: boolean };

const when = (iso: string) => `${formatDate(istDate(new Date(iso)))}, ${formatTime(iso)}`;

/** One claim: facts, receipt, who decided what and when; approve / reject or cancel when allowed. */
export function ClaimDetailSheet({ claim, onClose, mine }: { claim: DetailClaim | null; onClose: () => void; mine: boolean }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    setComment("");
    setError("");
  }, [claim?.id]);

  const run = (fn: () => ReturnType<typeof cancelClaim>) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      onClose();
      router.refresh();
    });

  const canCancel = mine && !!claim && (claim.status === "PENDING_MANAGER" || claim.status === "PENDING_HR");
  const steps = claim
    ? [
        { label: "Submitted", who: mine ? "You" : claim.employee.name, at: claim.createdAt, note: null as string | null },
        claim.manager && { label: claim.status === "REJECTED" && !claim.hr ? "Rejected by manager" : "Manager approved", who: claim.manager.name, at: claim.manager.at, note: claim.manager.comment },
        claim.hr && { label: claim.status === "REJECTED" ? "Rejected by HR" : "HR approved", who: claim.hr.name, at: claim.hr.at, note: claim.hr.comment },
        claim.paid && { label: "Paid", who: claim.paid.name, at: claim.paid.at, note: claim.paid.ref ? `Reference ${claim.paid.ref}` : null },
      ].filter((s): s is { label: string; who: string; at: string; note: string | null } => !!s)
    : [];

  return (
    <Sheet open={!!claim} onOpenChange={(o) => !o && !pending && onClose()}>
      <DrawerContent>
        {claim && (
          <>
            <SheetHeader className={drawerHeader}>
              <SheetTitle className={drawerTitle}>
                {claim.category} · <span className="tabular-nums">{formatRupees(claim.amount)}</span>
              </SheetTitle>
              <SheetDescription className={drawerDescription}>
                {mine ? "" : `${claim.employee.name} · ${claim.employee.code} · `}
                {formatDate(claim.expenseDate)}
              </SheetDescription>
            </SheetHeader>
            <div className={cn(drawerBody, "space-y-5")}>
              <ExpenseStatusChip status={claim.status} />
              <p className="text-body whitespace-pre-line text-ink-2">{claim.description}</p>
              {claim.hasReceipt ? (
                <a
                  href={`/api/expenses/${claim.id}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-glass px-3 text-label text-ink hover:bg-raised"
                >
                  <Paperclip aria-hidden className="size-4" /> View receipt
                </a>
              ) : (
                <p className="text-caption text-ink-3">No receipt attached.</p>
              )}

              <ol className="space-y-3 border-l border-line pl-4">
                {steps.map((s) => (
                  <li key={s.label} className="relative">
                    <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-ink" />
                    <p className="text-body font-medium text-ink">{s.label}</p>
                    <p className="text-caption text-ink-3 tabular-nums">
                      {s.who} · {when(s.at)}
                    </p>
                    {s.note && <p className="mt-0.5 text-body text-ink-2">{s.note}</p>}
                  </li>
                ))}
                {(claim.status === "PENDING_MANAGER" || claim.status === "PENDING_HR" || claim.status === "APPROVED") && (
                  <li className="relative">
                    <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border border-dashed border-ink-3 bg-raised" />
                    <p className="text-body text-ink-3">
                      {claim.status === "PENDING_MANAGER" ? "Waiting for the reporting manager" : claim.status === "PENDING_HR" ? "Waiting for HR" : "Waiting for payment"}
                    </p>
                  </li>
                )}
              </ol>

              {claim.canDecide && (
                <div className="space-y-1.5">
                  <Label htmlFor="claim-comment">Comment</Label>
                  <Textarea id="claim-comment" rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Needed to reject; optional to approve" />
                </div>
              )}
              {error && (
                <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>
            {(claim.canDecide || canCancel) && (
              <SheetFooter className={drawerFooter}>
                {canCancel && (
                  <Button variant="outline" className="text-danger max-md:h-12 max-md:flex-1" disabled={pending} onClick={() => run(() => cancelClaim(claim.id))}>
                    Cancel claim
                  </Button>
                )}
                {claim.canDecide && (
                  <>
                    <Button
                      variant="outline"
                      className="text-danger max-md:h-12 max-md:flex-1"
                      disabled={pending}
                      onClick={() => (comment.trim().length < 3 ? setError("Say why it's rejected.") : run(() => decideClaim(claim.id, { decision: "REJECT", comment })))}
                    >
                      Reject
                    </Button>
                    <Button variant="mint" className="max-md:h-12 max-md:flex-1" disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => decideClaim(claim.id, { decision: "APPROVE", comment }))}>
                      {pending && <Loader2 className="animate-spin" />}
                      Approve
                    </Button>
                  </>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </DrawerContent>
    </Sheet>
  );
}
