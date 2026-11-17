"use client";

import { CheckCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { reviewDailyReport } from "@/lib/actions/daily-reports";
import type { TeamReportRow } from "@/lib/daily-reports";
import { formatDate, WEEKDAYS, weekdayOf } from "@/lib/time";
import { DrawerContent, drawerBody, drawerDescription, drawerFooter, drawerHeader, drawerTitle } from "@/components/requests/drawer";
import { cn } from "@/lib/utils";
import { BlockedChip, ReportBody, ReviewChip } from "./report-body";

/** A reviewer reads one report and marks it reviewed, with an optional comment for the employee. */
export function ReviewSheet({ report, onClose, currentEmployeeId, isSuperAdmin }: { report: TeamReportRow | null; onClose: () => void; currentEmployeeId: number | null; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const own = !!report && report.employee.id === currentEmployeeId && !isSuperAdmin;

  const review = () =>
    start(async () => {
      if (!report) return;
      const res = await reviewDailyReport({ id: report.id, comment });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message, { description: report.employee.name });
      setComment("");
      onClose();
      router.refresh();
    });

  return (
    <Sheet
      open={!!report}
      onOpenChange={(o) => {
        if (!o) {
          setComment("");
          onClose();
        }
      }}
    >
      <DrawerContent>
        <SheetHeader className={drawerHeader}>
          <SheetTitle className={drawerTitle}>Daily report</SheetTitle>
          <SheetDescription className={drawerDescription}>{report ? `${WEEKDAYS[weekdayOf(report.date)]}, ${formatDate(report.date)}` : ""}</SheetDescription>
        </SheetHeader>

        {report && (
          <div className={cn(drawerBody, "space-y-6")}>
            <div className="flex items-center gap-3">
              <EmployeeAvatar name={report.employee.name} photo={report.employee.photo} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">{report.employee.name}</p>
                <p className="truncate text-caption text-ink-3">
                  <span className="tabular-nums">{report.employee.code}</span>
                  {report.employee.department && ` · ${report.employee.department}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ReviewChip reviewed={!!report.reviewed} />
                {report.blocked && <BlockedChip />}
              </div>
            </div>

            <ReportBody report={report} workedMinutes={report.workedMinutes} />

            {!report.reviewed && !own && (
              <div className="space-y-2">
                <Label htmlFor="review-comment">
                  Comment <span className="font-normal text-ink-3">(optional)</span>
                </Label>
                <Textarea id="review-comment" rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Shown to the employee, e.g. Good progress. Ping design about the blocker." />
              </div>
            )}
            {!report.reviewed && own && <p className="rounded-md bg-sunken px-3 py-2.5 text-body text-ink-2">This is your own report. Someone else has to review it.</p>}
          </div>
        )}

        {report && !report.reviewed && !own && (
          <SheetFooter className={drawerFooter}>
            <Button variant="outline" className="max-md:h-12 max-md:flex-1" onClick={onClose} disabled={pending}>
              Close
            </Button>
            <Button className="max-md:h-12 max-md:flex-1" onClick={review} disabled={pending} aria-busy={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              Mark reviewed
            </Button>
          </SheetFooter>
        )}
      </DrawerContent>
    </Sheet>
  );
}
