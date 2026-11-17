"use client";

import { Ban, CircleAlert, CircleCheck, CircleX, ClipboardPen, Hourglass, Inbox, Loader2, Plus } from "lucide-react";
import { Illustration, REQUEST_ART } from "@/components/ui/illustration";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState, Panel } from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelRequest, requestCancellation } from "@/lib/actions/requests";
import type { RequestRow } from "@/lib/requests";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { REQUEST_TYPE_META } from "@/lib/validations/requests";
import { AttachmentLink, requestWhen } from "./request-meta";
import { RequestStatusChip, RequestTypeChip } from "./request-chips";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "CLOSED", label: "Rejected / cancelled" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const DECISION_ICON = { PENDING: Hourglass, CANCEL_REQUESTED: Hourglass, APPROVED: CircleCheck, REJECTED: CircleX, CANCELLED: Ban } as const;
const DECISION_TONE = { PENDING: "text-st-pending", CANCEL_REQUESTED: "text-st-pending", APPROVED: "text-st-present", REJECTED: "text-st-absent", CANCELLED: "text-ink-3" } as const;

/** Decided requests: one outcome line (who and when), with the approver's comment under it. */
function DecisionLine({ r }: { r: RequestRow }) {
  const Icon = DECISION_ICON[r.status];
  return (
    <div className="mt-3 rounded-md bg-sunken px-3 py-2">
      <p className="flex items-start gap-2 text-caption text-ink-2">
        <Icon aria-hidden className={cn("mt-px size-3.5 shrink-0", DECISION_TONE[r.status])} />
        <span className="min-w-0 tabular-nums">
          {r.approverName ?? "HR"}
          {r.decidedAt ? ` · ${r.decidedAt}` : ""}
        </span>
      </p>
      {r.decisionComment && <p className="mt-1 pl-5.5 text-body text-ink">{r.decisionComment}</p>}
    </div>
  );
}

const matches = (r: RequestRow, f: Filter) =>
  f === "ALL" ||
  (f === "OPEN" && (r.status === "PENDING" || r.status === "CANCEL_REQUESTED")) ||
  (f === "APPROVED" && r.status === "APPROVED") ||
  (f === "CLOSED" && (r.status === "REJECTED" || r.status === "CANCELLED"));

export function MyRequests({ rows, onNew }: { rows: RequestRow[]; onNew: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState<RequestRow | null>(null);
  const [askCancel, setAskCancel] = useState<RequestRow | null>(null);
  const [why, setWhy] = useState("");
  const [whyError, setWhyError] = useState("");

  const shown = rows.filter((r) => matches(r, filter));

  const doCancel = () =>
    start(async () => {
      if (!confirmCancel) return;
      const res = await cancelRequest(confirmCancel.id);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.message);
      setConfirmCancel(null);
      router.refresh();
    });

  const doAskCancel = () =>
    start(async () => {
      if (!askCancel) return;
      setWhyError("");
      const res = await requestCancellation(askCancel.id, why);
      if (!res.ok) {
        if (res.field === "reason") setWhyError(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setAskCancel(null);
      setWhy("");
      router.refresh();
    });

  return (
    <Panel
      title="My requests"
      description="Pending requests can be cancelled. Approved ones need HR to agree to the cancellation."
      bodyClassName="p-0"
    >
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2 [scrollbar-width:none] sm:px-3" role="tablist" aria-label="Filter my requests">
        {FILTERS.map((f) => {
          const count = rows.filter((r) => matches(r, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className={cn(
                "relative flex h-11 shrink-0 items-center gap-2 rounded-xs px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10",
                active ? "text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {f.label}
              <span className="rounded-full bg-sunken px-1.5 text-caption text-ink-2 tabular-nums">{count}</span>
              {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          art="mailbox"
          title={rows.length ? "Nothing here" : "No requests yet"}
          action={
            !rows.length && (
              <Button onClick={onNew}>
                <Plus /> New request
              </Button>
            )
          }
        >
          {rows.length ? "No requests match this filter." : "Leave, WFH, permission, on duty and punch fixes all start here."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line" data-testid="my-requests">
          {shown.map((r) => (
            <li key={r.id} className="px-4 py-4 sm:px-6" data-testid={`request-${r.id}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
                <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                <Illustration name={REQUEST_ART[r.type]} size={52} className="mt-0.5 max-sm:size-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <RequestTypeChip type={r.type} label={r.leaveType?.name} />
                    <RequestStatusChip status={r.status} />
                  </div>
                  <p className="mt-2 text-title-3 text-ink tabular-nums">{requestWhen(r)}</p>
                  <p className="mt-1.5 line-clamp-3 border-l-2 border-line-strong pl-3 text-body text-ink-2">{r.reason}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-ink-3">
                    {r.enteredByName ? (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <ClipboardPen aria-hidden className="size-3.5" />
                        Entered by {r.enteredByName} · {formatDate(r.createdAt)}
                      </span>
                    ) : (
                      <span className="tabular-nums">Sent {formatDate(r.createdAt)}</span>
                    )}
                    {r.hasAttachment && <AttachmentLink id={r.id} />}
                  </div>
                  {(r.decisionComment || (r.decidedAt && r.status !== "PENDING")) && <DecisionLine r={r} />}
                </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 empty:hidden">
                  {r.status === "PENDING" && (
                    <Button variant="outline" size="sm" className="max-md:h-11 max-md:w-full max-md:text-m-meta" onClick={() => setConfirmCancel(r)}>
                      Cancel request
                    </Button>
                  )}
                  {r.status === "APPROVED" && r.type !== "REGULARIZATION" && (
                    <Button variant="outline" size="sm" className="max-md:h-11 max-md:w-full max-md:text-m-meta" onClick={() => setAskCancel(r)}>
                      Request cancellation
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCancel && `${confirmCancel.leaveType?.name ?? REQUEST_TYPE_META[confirmCancel.type].label} · ${requestWhen(confirmCancel)}. HR won't see it any more.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                doCancel();
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!askCancel}
        onOpenChange={(o) => {
          if (!o) {
            setAskCancel(null);
            setWhy("");
            setWhyError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request cancellation</DialogTitle>
            <DialogDescription>
              {askCancel && `${askCancel.leaveType?.name ?? ""} ${requestWhen(askCancel)}`.trim()}. It stays approved until HR agrees{askCancel?.type === "LEAVE" ? "; then the days go back to your balance" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea id="cancel-reason" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Plans changed" aria-invalid={!!whyError} className="text-m-body md:text-body" />
            {whyError && (
              <p className="flex items-center gap-1.5 text-caption text-danger">
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {whyError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskCancel(null)} disabled={pending}>
              Keep it
            </Button>
            <Button onClick={doAskCancel} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Send to HR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
