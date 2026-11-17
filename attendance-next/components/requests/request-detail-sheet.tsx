"use client";

import { Ban, Check, CircleAlert, CircleCheck, CircleX, ClipboardPen, Hourglass, Loader2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusChip } from "@/components/attendance/status-chip";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { decideRequests, loadRequestDetail } from "@/lib/actions/requests";
import type { RequestDetail } from "@/lib/requests";
import type { AttendanceStatus } from "@prisma/client";
import { formatDate, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { fmtNum, formatMinutes, minutesBetween, REQUEST_STATUS_META } from "@/lib/validations/requests";
import { AttachmentLink, requestWhen } from "./request-meta";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "./drawer";
import { RequestStatusChip, RequestTypeChip } from "./request-chips";

/** Approver's view of one request: who, what, balance impact, the attendance on those days, decide. */
export function RequestDetailSheet({ id, onClose, currentUserId, isSuperAdmin }: { id: number | null; onClose: () => void; currentUserId: number; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const [pending, start] = useTransition();
  const [deciding, setDeciding] = useState<"APPROVE" | "REJECT" | null>(null);
  const [moreReason, setMoreReason] = useState(false);

  useEffect(() => {
    if (id === null) return;
    let live = true;
    setDetail(null);
    setLoadError("");
    setComment("");
    setCommentError("");
    setMoreReason(false);
    loadRequestDetail(id).then((res) => {
      if (!live) return;
      if (res.ok) setDetail(res.detail);
      else setLoadError(res.error);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const r = detail?.request;
  const open = r ? r.status === "PENDING" || r.status === "CANCEL_REQUESTED" : false;
  const own = !!r && r.employee.userId === currentUserId && !isSuperAdmin;
  const cancelling = r?.status === "CANCEL_REQUESTED";

  const decide = (decision: "APPROVE" | "REJECT") =>
    start(async () => {
      if (!r) return;
      setCommentError("");
      if (decision === "REJECT" && comment.trim().length < 3) {
        setCommentError("Add a comment saying why.");
        return;
      }
      setDeciding(decision);
      const res = await decideRequests({ ids: [r.id], decision, comment });
      setDeciding(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(cancelling ? (decision === "APPROVE" ? "Cancellation approved" : "Cancellation declined") : res.message);
      onClose();
      router.refresh();
    });

  const longReason = !!r && (r.reason.length > 220 || r.reason.split("\n").length > 3);
  const DecidedIcon = r ? DECIDED_ICON[r.status] : CircleCheck;

  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent aria-busy={!detail && !loadError}>
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>{r ? `${r.leaveType?.name ?? REQUEST_LABEL[r.type]} request` : "Request"}</SheetTitle>
          <SheetDescription className={drawerDescription}>{r ? `#${r.id} · ${r.enteredByName ? "entered" : "sent"} ${formatDate(r.createdAt)}` : "Loading…"}</SheetDescription>
        </SheetHeader>

        <div className={cn(drawerBody, "space-y-6")}>
          {loadError ? (
            <p role="alert" className="flex gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {loadError}
            </p>
          ) : !detail || !r ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2 rounded-xs" />
                  <Skeleton className="h-3 w-1/3 rounded-xs" />
                </div>
              </div>
              <Skeleton className="h-6 w-2/3 rounded-xs" />
              <Skeleton className="h-20 w-full rounded-xs" />
              <Skeleton className="h-40 w-full rounded-xs" />
            </div>
          ) : (
            <>
              {/* Leave request card (DESIGN.md §4.5) */}
              <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <EmployeeAvatar name={r.employee.name} photo={r.employee.photo} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{r.employee.name}</p>
                    <p className="truncate text-caption text-ink-3">
                      <span className="tabular-nums [font-feature-settings:'zero']">{r.employee.code}</span>
                      {[detail.employee.designation, detail.employee.department].filter(Boolean).map((x) => ` · ${x}`)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RequestTypeChip type={r.type} label={r.leaveType?.name} />
                  <RequestStatusChip status={r.status} />
                </div>

                <div>
                  <p className="text-title-3 text-ink tabular-nums">{requestWhen(r)}</p>
                  {detail.balance &&
                    (detail.balance.isPaid ? (
                      <p className="mt-0.5 text-body text-ink-2 tabular-nums">
                        {detail.balance.name} balance {fmtNum(detail.balance.available)} →{" "}
                        <span className={cn("font-semibold text-ink", detail.balance.after < 0 && "text-danger")}>{fmtNum(detail.balance.after)}</span>
                        <span className="text-ink-3"> · {detail.balance.year}</span>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-body text-ink-2">{detail.balance.name} is unpaid. No balance is used.</p>
                    ))}
                  {detail.balance?.isPaid && detail.balance.after < 0 && open && !cancelling && (
                    <p className="mt-1 flex gap-1.5 text-caption text-danger">
                      <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                      Not enough balance. Approving will fail; ask them to apply as Loss of Pay.
                    </p>
                  )}
                  {r.type === "PERMISSION" && r.startTime && r.endTime && (
                    <p className="mt-1 text-caption text-ink-3 tabular-nums">
                      {formatMinutes(minutesBetween(r.startTime, r.endTime))} (limit {formatMinutes(detail.caps.permissionMaxMinutes)}) · {detail.permissionsThisMonth ?? 0} other permission
                      {detail.permissionsThisMonth === 1 ? "" : "s"} this month (limit {detail.caps.permissionPerMonth})
                    </p>
                  )}
                </div>

                <figure>
                  <figcaption className="text-caption text-ink-3">{r.type === "ON_DUTY" ? "Purpose" : "Reason"}</figcaption>
                  <blockquote className={cn("mt-1 border-l-2 border-line-strong pl-3 text-body whitespace-pre-line text-ink-2", longReason && !moreReason && "line-clamp-3")}>{r.reason}</blockquote>
                  {longReason && (
                    <button type="button" onClick={() => setMoreReason((m) => !m)} className="mt-1 pl-3 text-caption text-brand-ink hover:underline focus-visible:underline focus-visible:outline-none">
                      {moreReason ? "Less" : "More"}
                    </button>
                  )}
                </figure>

                {(r.hasAttachment || r.enteredByName) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    {r.hasAttachment && <AttachmentLink id={r.id} />}
                    {r.enteredByName && (
                      <p className="flex items-center gap-1.5 text-caption text-ink-3">
                        <ClipboardPen aria-hidden className="size-3.5" />
                        Entered by {r.enteredByName} on {r.employee.name}&rsquo;s behalf
                      </p>
                    )}
                  </div>
                )}

                {cancelling && (
                  <div className="rounded-md border border-dashed border-st-pending bg-st-pending-tint px-3 py-2.5 text-st-pending-fg">
                    <p className="flex items-center gap-1.5 text-label">
                      <Hourglass aria-hidden className="size-3.5" />
                      Cancellation requested
                    </p>
                    <p className="mt-1 text-body">{detail.cancellationReason ?? "No reason given."}</p>
                    <p className="mt-1 text-caption">Approving the cancellation removes the request{r.type === "LEAVE" ? " and returns the days to the balance" : ""}.</p>
                  </div>
                )}

                {(detail.wfhOverCap || detail.overlaps.length > 0) && (
                  <div className="space-y-2 rounded-md bg-st-late-tint px-3 py-2.5 text-st-late-fg">
                    {detail.wfhOverCap && (
                      <p className="flex gap-1.5 text-body">
                        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        Goes past the WFH limit of {detail.caps.wfhPerMonth} days a month.
                      </p>
                    )}
                    {detail.overlaps.length > 0 && (
                      <div>
                        <p className="flex items-center gap-1.5 text-label">
                          <TriangleAlert aria-hidden className="size-4 shrink-0" />
                          Other requests on these dates
                        </p>
                        <ul className="mt-1.5 space-y-1.5 pl-5.5">
                          {detail.overlaps.map((o) => (
                            <li key={o.id} className="flex items-center justify-between gap-2 text-body tabular-nums">
                              <span className="min-w-0 truncate">{o.label}</span>
                              <RequestStatusChip status={o.status} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Decided: one collapsed outcome line */}
              {!open && (r.decisionComment || r.decidedAt) && (
                <section className="rounded-lg border border-line bg-surface px-4 py-3">
                  <p className="flex items-start gap-2 text-body text-ink">
                    <DecidedIcon aria-hidden className={cn("mt-0.5 size-4 shrink-0", DECIDED_TONE[r.status])} />
                    <span className="min-w-0 tabular-nums">
                      <span className="font-medium">{REQUEST_STATUS_META[r.status].label}</span>
                      {r.approverName ? ` by ${r.approverName}` : ""}
                      {r.decidedAt && <span className="text-ink-3"> · {r.decidedAt}</span>}
                    </span>
                  </p>
                  {r.decisionComment && <p className="mt-1.5 border-l-2 border-line pl-3 text-body text-ink-2">{r.decisionComment}</p>}
                </section>
              )}

              <section>
                <h3 className="text-label text-ink">Attendance on these days</h3>
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                  {detail.days.map((d) => (
                    <li key={d.date} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-body">
                      <span className="min-w-0 text-ink tabular-nums">
                        {formatDate(d.date).slice(0, 6)} <span className="text-caption text-ink-3">{WEEKDAYS[weekdayOf(d.date)]!.slice(0, 3)}</span>
                      </span>
                      <span className="ml-auto text-caption text-ink-3 tabular-nums">{d.in ? `${d.in} – ${d.out ?? "…"}` : ""}</span>
                      <StatusChip status={d.status as AttendanceStatus | null} label={d.holiday && d.status === "HOLIDAY" ? d.holiday : d.status ? undefined : "Upcoming"} />
                    </li>
                  ))}
                </ul>
              </section>

              {open && !own && (
                <div className="space-y-1.5">
                  <Label htmlFor="decision-comment" className="text-label text-ink">
                    Comment <span className="font-normal text-ink-3">(needed to reject)</span>
                  </Label>
                  <Textarea
                    id="decision-comment"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Shown to the employee"
                    aria-invalid={!!commentError}
                    aria-describedby={commentError ? "decision-comment-error" : undefined}
                    className="text-m-body md:text-body"
                  />
                  {commentError && (
                    <p id="decision-comment-error" className="flex items-center gap-1.5 text-caption text-danger">
                      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                      {commentError}
                    </p>
                  )}
                </div>
              )}
              {open && own && <p className="rounded-md bg-sunken px-3 py-2.5 text-body text-ink-2">This is your own request. Another approver has to decide it.</p>}
            </>
          )}
        </div>

        {open && !own && (
          <SheetFooter className={drawerFooter}>
            <Button variant="outline" className="text-danger hover:text-danger max-md:h-12 max-md:flex-1" onClick={() => decide("REJECT")} disabled={pending} aria-busy={deciding === "REJECT"}>
              {deciding === "REJECT" ? <Loader2 className="animate-spin" /> : <X />}
              {cancelling ? "Keep approved" : "Reject"}
            </Button>
            <Button variant="mint" className="max-md:h-12 max-md:flex-1" onClick={() => decide("APPROVE")} disabled={pending} aria-busy={deciding === "APPROVE"}>
              {deciding === "APPROVE" ? <Loader2 className="animate-spin" /> : <Check />}
              {cancelling ? "Approve cancellation" : "Approve"}
            </Button>
          </SheetFooter>
        )}
      </DrawerContent>
    </Sheet>
  );
}

const DECIDED_ICON = { PENDING: Hourglass, CANCEL_REQUESTED: Hourglass, APPROVED: CircleCheck, REJECTED: CircleX, CANCELLED: Ban } as const;
const DECIDED_TONE = { PENDING: "text-st-pending", CANCEL_REQUESTED: "text-st-pending", APPROVED: "text-st-present", REJECTED: "text-st-absent", CANCELLED: "text-ink-3" } as const;

const REQUEST_LABEL = { LEAVE: "Leave", WFH: "WFH", PERMISSION: "Permission", ON_DUTY: "On-duty", REGULARIZATION: "Regularization" } as const;
