"use client";

import { LiveRefresh } from "@/components/layout/live-refresh";
import { Banknote, Download, Loader2, Paperclip, Plus, Receipt } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import * as T from "@/components/reports/table-styles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { markClaimsPaid } from "@/lib/actions/expenses";
import type { CategoryRow, ClaimRow } from "@/lib/expenses";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatRupees, type ExpenseListParams } from "@/lib/validations/expenses";
import { CategoriesPanel } from "./categories-panel";
import { ClaimDetailSheet, type DetailClaim } from "./claim-detail-sheet";
import { ClaimSheet, type ClaimCategory } from "./claim-sheet";
import { ExpenseStatusChip } from "./expense-status-chip";

type View = "mine" | "approvals" | "categories";
const TAB_LABEL: Record<View, string> = { mine: "My claims", approvals: "Approvals", categories: "Categories" };

const FILTERS: { key: ExpenseListParams["status"]; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "PAID", label: "Paid" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ALL", label: "All" },
];

export function ExpensesView({
  view,
  tabs,
  params,
  canClaim,
  canPay,
  claimCategories,
  mine,
  approvals,
  categories,
  designations,
  initialId,
  openNew,
}: {
  view: View;
  tabs: View[];
  params: ExpenseListParams;
  canClaim: boolean;
  canPay: boolean;
  claimCategories: ClaimCategory[];
  mine: ClaimRow[] | null;
  approvals: { rows: (ClaimRow & { canDecide: boolean })[]; waiting: number; toPay: { count: number; amount: number } } | null;
  categories: CategoryRow[] | null;
  designations: { id: number; name: string }[];
  initialId: number | null;
  openNew: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navPending, startNav] = useTransition();
  const [newOpen, setNewOpen] = useState(openNew);
  const rows: DetailClaim[] = useMemo(() => (view === "approvals" ? (approvals?.rows ?? []) : (mine ?? [])), [view, approvals, mine]);
  const [detailId, setDetailId] = useState<number | null>(initialId);
  const detail = rows.find((r) => r.id === detailId) ?? null;
  const [selected, setSelected] = useState<number[]>([]);
  const [payOpen, setPayOpen] = useState(false);

  const go = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("id");
    setSelected([]);
    startNav(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const payable = rows.filter((r) => r.status === "APPROVED");
  const selectedRows = payable.filter((r) => selected.includes(r.id));
  const total = (list: ClaimRow[]) => list.reduce((s, r) => s + r.amount, 0);

  const description =
    view === "approvals" && approvals
      ? `${approvals.waiting ? `${approvals.waiting} waiting for you` : "Nothing waiting for you"}${canPay && approvals.toPay.count ? ` · ${approvals.toPay.count} to pay (${formatRupees(approvals.toPay.amount)})` : ""}`
      : view === "categories"
        ? "Expense categories and how much one claim may be, by designation"
        : "Claim travel, food and other work costs with the bill attached";

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description={description}
        actions={
          canClaim && (
            <Button className="h-11 sm:h-10" onClick={() => setNewOpen(true)}>
              <Plus /> New claim
            </Button>
          )
        }
      />

      {tabs.length > 1 && (
        <Tabs value={view} onValueChange={(v) => go({ view: v === tabs[0] ? undefined : v, status: undefined })}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t} className="px-3">
                {TAB_LABEL[t]}
                {t === "approvals" && approvals?.waiting ? <span className="ml-1.5 rounded-full bg-sunken px-1.5 text-caption tabular-nums">{approvals.waiting}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {view === "categories" && categories && <CategoriesPanel categories={categories} designations={designations} />}

      {view !== "categories" && (
        <section className={T.tablePanel}>
          <div className={T.toolbar}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  variant="outline"
                  size="sm"
                  aria-pressed={params.status === f.key}
                  className={cn("rounded-full max-md:h-11", params.status === f.key && "border-brand bg-brand-subtle text-brand-ink hover:bg-brand-subtle")}
                  onClick={() => go({ status: f.key === "OPEN" ? undefined : f.key })}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <Input type="month" aria-label="Month" value={params.month ?? ""} onChange={(e) => go({ month: e.target.value || undefined })} className="w-full tabular-nums sm:w-44" />
            <div className="ml-auto flex flex-wrap gap-2">
              {view === "approvals" && canPay && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/export/expenses?${new URLSearchParams({ status: params.status, ...(params.month && { month: params.month }) })}`}>
                    <Download /> Excel
                  </a>
                </Button>
              )}
              {view === "approvals" && canPay && payable.length > 0 && (
                <Button size="sm" disabled={!selectedRows.length} onClick={() => setPayOpen(true)}>
                  <Banknote /> Mark paid{selectedRows.length ? ` · ${formatRupees(total(selectedRows))}` : ""}
                </Button>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              art={view === "approvals" ? "thumbs" : "mailbox"}
              title={view === "approvals" ? "Nothing here" : params.status === "OPEN" ? "No open claims" : "No claims"}
              action={
                view === "mine" &&
                canClaim && (
                  <Button variant="outline" onClick={() => setNewOpen(true)}>
                    <Plus /> New claim
                  </Button>
                )
              }
            >
              {view === "approvals" ? "Claims from your team show up here when they need a decision." : "When you spend on work, add a claim with the bill and it goes to your manager."}
            </EmptyState>
          ) : (
            <div className={cn("transition-opacity duration-[180ms]", navPending && "opacity-60")} aria-busy={navPending || undefined}>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow className={T.headRow}>
                    {view === "approvals" && canPay && (
                      <TableHead className={cn(T.th, "w-10")}>
                        <Checkbox
                          aria-label="Select all approved claims"
                          checked={payable.length > 0 && selectedRows.length === payable.length}
                          disabled={!payable.length}
                          onCheckedChange={(c) => setSelected(c === true ? payable.map((r) => r.id) : [])}
                        />
                      </TableHead>
                    )}
                    {view === "approvals" && <TableHead className={T.th}>Employee</TableHead>}
                    <TableHead className={cn(T.th, "text-right")}>Date</TableHead>
                    <TableHead className={T.th}>Category</TableHead>
                    <TableHead className={T.th}>What for</TableHead>
                    <TableHead className={cn(T.th, "text-right")}>Amount</TableHead>
                    <TableHead className={T.th}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={cn(T.row, "cursor-pointer")} data-state={selected.includes(r.id) ? "selected" : undefined} onClick={(e) => !(e.target as HTMLElement).closest("button,a,[role=checkbox]") && setDetailId(r.id)}>
                      {view === "approvals" && canPay && (
                        <TableCell className={cn(T.td, "w-10")}>
                          {r.status === "APPROVED" && (
                            <Checkbox
                              aria-label={`Select claim of ${r.employee.name}`}
                              checked={selected.includes(r.id)}
                              onCheckedChange={(c) => setSelected((s) => (c === true ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                            />
                          )}
                        </TableCell>
                      )}
                      {view === "approvals" && (
                        <TableCell className={T.td}>
                          <span className="block font-medium text-ink">{r.employee.name}</span>
                          <span className="block text-caption text-ink-3 tabular-nums">
                            {r.employee.code}
                            {r.employee.designation ? ` · ${r.employee.designation}` : ""}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className={cn(T.td, T.num, "whitespace-nowrap")}>{formatDate(r.expenseDate)}</TableCell>
                      <TableCell className={T.td}>{r.category}</TableCell>
                      <TableCell className={cn(T.td, "max-w-72")}>
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{r.description}</span>
                          {r.hasReceipt && <Paperclip aria-label="Receipt attached" className="size-3.5 shrink-0 text-ink-3" />}
                        </span>
                      </TableCell>
                      <TableCell className={cn(T.td, T.num, "font-medium text-ink")}>{formatRupees(r.amount)}</TableCell>
                      <TableCell className={T.td}>
                        <span className="flex items-center gap-2">
                          <ExpenseStatusChip status={r.status} />
                          {view === "approvals" && r.canDecide && (
                            <Button variant="mint" size="sm" onClick={() => setDetailId(r.id)}>
                              Review
                            </Button>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Phones */}
              <ul className="divide-y divide-line md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    {view === "approvals" && canPay && r.status === "APPROVED" && (
                      <Checkbox
                        className="mt-1"
                        aria-label={`Select claim of ${r.employee.name}`}
                        checked={selected.includes(r.id)}
                        onCheckedChange={(c) => setSelected((s) => (c === true ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                      />
                    )}
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(r.id)}>
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-body font-medium text-ink">{view === "approvals" ? r.employee.name : r.category}</span>
                        <span className="text-body font-medium text-ink tabular-nums">{formatRupees(r.amount)}</span>
                      </span>
                      <span className="block truncate text-caption text-ink-3 tabular-nums">
                        {formatDate(r.expenseDate)} · {view === "approvals" ? `${r.category} · ` : ""}
                        {r.description}
                      </span>
                      <ExpenseStatusChip status={r.status} className="mt-1.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className={T.footer}>
                <span>
                  <span className="tabular-nums">{rows.length}</span> claim{rows.length === 1 ? "" : "s"}
                </span>
                <span className="font-medium text-ink-2 tabular-nums">Total {formatRupees(total(rows))}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {canClaim && <ClaimSheet open={newOpen} onOpenChange={setNewOpen} categories={claimCategories} />}
      <ClaimDetailSheet claim={detail} mine={view === "mine"} onClose={() => setDetailId(null)} />
      <PayDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        ids={selectedRows.map((r) => r.id)}
        total={total(selectedRows)}
        onDone={() => {
          setSelected([]);
          router.refresh();
        }}
      />
    </div>
  );
}

function PayDialog({ open, onOpenChange, ids, total, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; ids: number[]; total: number; onDone: () => void }) {
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-title-3 text-ink">
            Mark {ids.length} claim{ids.length === 1 ? "" : "s"} paid?
          </DialogTitle>
          <DialogDescription className="text-body text-ink-2">
            Total <span className="tabular-nums">{formatRupees(total)}</span>. Each person gets a notification.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pay-ref">Payment reference (optional)</Label>
          <Input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} placeholder="e.g. UPI or NEFT reference, or 'With November salary'" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() =>
              start(async () => {
                const res = await markClaimsPaid(ids, ref);
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message);
                setRef("");
                onOpenChange(false);
                onDone();
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
