"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { CheckCheck, ChevronRight, Inbox, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { decideRequests } from "@/lib/actions/requests";
import type { RequestRow } from "@/lib/requests";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { REQUEST_TYPE_META, REQUEST_TYPES, type ApprovalParams } from "@/lib/validations/requests";
import { requestWhen } from "./request-meta";
import { RequestStatusChip, RequestTypeChip } from "./request-chips";
import { RequestDetailSheet } from "./request-detail-sheet";

const STATUS_TABS = [
  { key: "OPEN", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "ALL", label: "All" },
] as const;

export function ApprovalsView({
  rows,
  openCount,
  params,
  employees,
  currentUserId,
  isSuperAdmin,
  initialId,
}: {
  rows: RequestRow[];
  openCount: number;
  params: ApprovalParams;
  employees: { id: number; name: string; code: string }[];
  currentUserId: number;
  isSuperAdmin: boolean;
  initialId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, startNav] = useTransition();
  const [pending, start] = useTransition();
  const [detailId, setDetailId] = useState<number | null>(initialId);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkComment, setBulkComment] = useState("");

  const canDecide = (r: RequestRow) => (r.status === "PENDING" || r.status === "CANCEL_REQUESTED") && (r.employee.userId !== currentUserId || isSuperAdmin);

  const setParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (k === "status" && v === "OPEN") || (k === "type" && v === "ALL")) next.delete(k);
      else next.set(k, v);
    }
    next.delete("id");
    setSelection({});
    startNav(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const columns = useMemo<ColumnDef<RequestRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const selectable = table.getRowModel().rows.filter((r) => r.getCanSelect());
          const all = selectable.length > 0 && selectable.every((r) => r.getIsSelected());
          const some = selectable.some((r) => r.getIsSelected());
          return (
            <Checkbox
              aria-label="Select all"
              disabled={!selectable.length}
              checked={all ? true : some ? "indeterminate" : false}
              onCheckedChange={(c) => selectable.forEach((r) => r.toggleSelected(!!c))}
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox aria-label={`Select request ${row.original.id}`} disabled={!row.getCanSelect()} checked={row.getIsSelected()} onCheckedChange={(c) => row.toggleSelected(!!c)} />
        ),
      },
      {
        id: "employee",
        header: "Employee",
        cell: ({ row: { original: r } }) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <EmployeeAvatar name={r.employee.name} photo={r.employee.photo} className="size-7" />
            <span className="min-w-0">
              <span className="block truncate text-body font-medium text-ink">{r.employee.name}</span>
              <span className="block text-caption text-ink-3 tabular-nums [font-feature-settings:'zero']">{r.employee.code}</span>
            </span>
          </span>
        ),
      },
      { id: "type", header: "Type", cell: ({ row: { original: r } }) => <RequestTypeChip type={r.type} label={r.leaveType?.code ?? undefined} /> },
      { id: "when", header: "Dates", cell: ({ row: { original: r } }) => <span className="text-cell font-medium whitespace-nowrap text-ink tabular-nums">{requestWhen(r)}</span> },
      { id: "reason", header: "Reason", cell: ({ row: { original: r } }) => <span className="line-clamp-1 max-w-56 text-cell text-ink-2">{r.reason}</span> },
      {
        id: "sent",
        header: "Sent",
        cell: ({ row: { original: r } }) => (
          <span className="block text-caption whitespace-nowrap text-ink-3">
            <span className="block tabular-nums">{formatDate(r.createdAt)}</span>
            {r.enteredByName && <span className="block max-w-36 truncate">Entered by {r.enteredByName}</span>}
          </span>
        ),
      },
      { id: "status", header: "Status", cell: ({ row: { original: r } }) => <RequestStatusChip status={r.status} /> },
      {
        id: "open",
        header: () => <span className="sr-only">Review</span>,
        cell: ({ row: { original: r } }) => (
          <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)} aria-label={`Review request ${r.id} from ${r.employee.name}`}>
            Review
          </Button>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
    enableRowSelection: (row) => canDecide(row.original),
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
  });
  const selectedIds = Object.keys(selection)
    .filter((k) => selection[k])
    .map(Number)
    .filter((id) => rows.some((r) => r.id === id && canDecide(r)));

  const bulkApprove = () =>
    start(async () => {
      const res = await decideRequests({ ids: selectedIds, decision: "APPROVE", comment: bulkComment });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      for (const f of res.failed) toast.error(`#${f.id}: ${f.error}`);
      setBulkOpen(false);
      setBulkComment("");
      setSelection({});
      router.refresh();
    });

  const filtered = params.type !== "ALL" || !!params.employee;

  return (
    <>
      <Panel bodyClassName="p-0">
        {/* Status tabs */}
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2 [scrollbar-width:none] sm:px-3" role="tablist" aria-label="Status">
          {STATUS_TABS.map((t) => {
            const active = params.status === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setParams({ status: t.key })}
                className={cn(
                  "relative flex h-11 shrink-0 items-center gap-2 rounded-xs px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10",
                  active ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {t.label}
                {t.key === "OPEN" && openCount > 0 && <span className="rounded-full bg-sunken px-1.5 text-caption text-ink-2 tabular-nums">{openCount}</span>}
                {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
              </button>
            );
          })}
        </div>

        {/* Filters; a bulk bar takes their place while rows are selected (DESIGN.md §4.2) */}
        {selectedIds.length > 0 ? (
          <div className="flex min-h-[57px] flex-wrap items-center gap-2 border-b border-line bg-brand-subtle px-3 py-2 text-brand-ink sm:px-4" role="region" aria-label="Bulk actions">
            <span className="text-label tabular-nums">{selectedIds.length} selected</span>
            <Button variant="link" size="sm" className="px-1 text-brand-ink" onClick={() => setSelection({})}>
              Clear
            </Button>
            <Button variant="mint" size="sm" className="ml-auto" onClick={() => setBulkOpen(true)}>
              <CheckCheck /> Approve {selectedIds.length}
            </Button>
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:px-4">
          <Select value={params.type} onValueChange={(v) => setParams({ type: v })}>
            <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44" aria-label="Request type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {REQUEST_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {REQUEST_TYPE_META[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={params.employee ? String(params.employee) : "all"} onValueChange={(v) => setParams({ employee: v === "all" ? undefined : v })}>
            <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-56" aria-label="Employee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name} <span className="text-ink-3 tabular-nums">· {e.code}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => setParams({ type: undefined, employee: undefined })}>
              Clear
            </Button>
          )}
          {navigating && <Loader2 aria-label="Loading" className="size-4 animate-spin text-ink-3" />}
        </div>
        )}

        {rows.length === 0 ? (
          <EmptyState icon={Inbox} art="mailbox" title={params.status === "OPEN" && !filtered ? "All caught up" : "No requests"}>
            {params.status === "OPEN" && !filtered ? "Nothing is waiting for a decision." : "No requests match these filters."}
          </EmptyState>
        ) : (
          <div className={cn("transition-opacity", navigating && "opacity-60")}>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="border-line bg-sunken hover:bg-sunken">
                      {hg.headers.map((h) => (
                        <TableHead key={h.id} className="h-10 text-col-header text-ink-3 first:w-10 first:border-l-2 first:border-transparent first:pl-4 last:pr-4">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className="cursor-pointer border-line hover:bg-sunken data-[state=selected]:bg-brand-subtle [&>td:first-child]:border-l-2 [&>td:first-child]:border-transparent data-[state=selected]:[&>td:first-child]:border-brand"
                      onClick={(e) => {
                      // Row click opens the drawer; checkbox and buttons keep their own behaviour.
                      if ((e.target as HTMLElement).closest("button,[role=checkbox],a")) return;
                      setDetailId(row.original.id);
                    }}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-2.5 first:pl-4 last:w-24 last:pr-4 last:text-right">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Phone cards */}
            <ul className="divide-y divide-line md:hidden">
              {table.getRowModel().rows.map((row) => {
                const r = row.original;
                return (
                  <li key={r.id} className={cn("flex items-start gap-1 py-2 pr-4 pl-1 transition-colors", row.getIsSelected() && "bg-brand-subtle")}>
                    <span className="grid size-11 shrink-0 place-items-center">
                      <Checkbox aria-label={`Select request ${r.id}`} disabled={!row.getCanSelect()} checked={row.getIsSelected()} onCheckedChange={(c) => row.toggleSelected(!!c)} />
                    </span>
                    <button type="button" onClick={() => setDetailId(r.id)} className="flex min-w-0 flex-1 items-start gap-3 rounded-md py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-m-body font-medium text-ink">{r.employee.name}</span>
                          <RequestStatusChip status={r.status} />
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <RequestTypeChip type={r.type} label={r.leaveType?.code ?? undefined} />
                          <span className="text-m-meta text-ink tabular-nums">{requestWhen(r)}</span>
                        </span>
                        <span className="mt-1 line-clamp-1 block text-m-caption text-ink-2">{r.reason}</span>
                        {r.enteredByName && <span className="mt-0.5 block truncate text-m-caption text-ink-3">Entered by {r.enteredByName}</span>}
                      </span>
                      <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Panel>

      <RequestDetailSheet id={detailId} onClose={() => setDetailId(null)} currentUserId={currentUserId} isSuperAdmin={isSuperAdmin} />

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Approve {selectedIds.length} request{selectedIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>Leave days come out of each balance. Cancellation requests in the selection are approved too. Each employee is notified.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-comment">
              Comment <span className="font-normal text-ink-3">(optional)</span>
            </Label>
            <Textarea id="bulk-comment" rows={2} value={bulkComment} onChange={(e) => setBulkComment(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                bulkApprove();
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
