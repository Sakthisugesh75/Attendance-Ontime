"use client";

import { LiveRefresh } from "@/components/layout/live-refresh";
import { ClipboardPen, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BalanceRow, RequestFormOptions, RequestRow } from "@/lib/requests";
import type { ApprovalParams, RequestTypeKey } from "@/lib/validations/requests";
import { ApprovalsView } from "./approvals-view";
import { BalanceCards } from "./balance-cards";
import { MyRequests } from "./my-requests";
import { RecordRequestSheet } from "./record-request-sheet";
import { RequestSheet } from "./request-sheet";

export interface RequestsViewProps {
  view: "approvals" | "mine";
  /** Approver who also has an employee record: both tabs */
  showTabs: boolean;
  mine: { balances: BalanceRow[]; year: string; rows: RequestRow[]; options: RequestFormOptions } | null;
  approvals: {
    rows: RequestRow[];
    openCount: number;
    params: ApprovalParams;
    employees: { id: number; name: string; code: string }[];
    currentUserId: number;
    isSuperAdmin: boolean;
    initialId: number | null;
    /** The approver's own employee record: never offered in "Record for employee" */
    selfEmployeeId: number | null;
  } | null;
  openNew: RequestTypeKey | null;
  /** ?record=<employeeId>: open "Record for employee" with that employee picked */
  recordFor: number | null;
}

export function RequestsView({ view, showTabs, mine, approvals, openNew, recordFor }: RequestsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startNav] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(!!openNew && !!mine);
  // A new key per opening remounts the record sheet, so each entry starts with a clean picker.
  const [record, setRecord] = useState({ open: !!recordFor && !!approvals, key: 0, employeeId: recordFor });
  const entryEmployees = approvals ? approvals.employees.filter((e) => e.id !== approvals.selfEmployeeId) : [];

  const go = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startNav(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const onSheetChange = (open: boolean) => {
    setSheetOpen(open);
    if (!open && searchParams.has("new")) go({ new: undefined });
  };

  const onRecordChange = (open: boolean) => {
    setRecord((r) => ({ ...r, open }));
    if (!open && searchParams.has("record")) go({ record: undefined });
  };

  const description =
    view === "approvals" && approvals
      ? approvals.openCount
        ? `${approvals.openCount} waiting for a decision · leave, WFH, permission, on duty and punch fixes`
        : "Nothing waiting · leave, WFH, permission, on duty and punch fixes"
      : "Leave balance, and your leave, WFH, permission, on-duty and punch-fix requests";

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <PageHeader
        eyebrow={view === "approvals" ? "Approvals" : `Requests · ${mine?.year ?? ""}`}
        title="Requests"
        description={description}
        actions={
          (mine || approvals) && (
            <>
              {approvals && (
                <Button variant={mine ? "outline" : "default"} onClick={() => setRecord((r) => ({ open: true, key: r.key + 1, employeeId: null }))}>
                  <ClipboardPen /> Record for employee
                </Button>
              )}
              {mine && (
                <Button onClick={() => setSheetOpen(true)}>
                  <Plus /> New request
                </Button>
              )}
            </>
          )
        }
      />

      {showTabs && (
        <Tabs value={view} onValueChange={(v) => go({ view: v === "approvals" ? undefined : v, status: undefined, type: undefined, employee: undefined, id: undefined })}>
          <TabsList>
            <TabsTrigger value="approvals" className="px-3">
              Approvals
            </TabsTrigger>
            <TabsTrigger value="mine" className="px-3">
              My requests
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {view === "approvals" && approvals && <ApprovalsView {...approvals} />}

      {view === "mine" && mine && (
        <>
          <section aria-labelledby="balance-heading" className="space-y-3">
            <h3 id="balance-heading" className="text-title-3 text-ink tabular-nums">
              Leave balance · {mine.year}
            </h3>
            <BalanceCards balances={mine.balances} />
          </section>
          <MyRequests rows={mine.rows} onNew={() => setSheetOpen(true)} />
        </>
      )}

      {mine && <RequestSheet open={sheetOpen} onOpenChange={onSheetChange} options={mine.options} initialType={openNew ?? undefined} />}
      {approvals && <RecordRequestSheet key={record.key} open={record.open} onOpenChange={onRecordChange} employees={entryEmployees} initialEmployeeId={record.employeeId} />}
    </div>
  );
}
