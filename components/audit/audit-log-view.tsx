"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Cpu, ScrollText, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { EmptyState } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as T from "@/components/reports/table-styles";
import { cn } from "@/lib/utils";
import type { AuditRow } from "./audit-query";
import { AUDIT_PAGE_SIZE, type AuditParams } from "./audit-utils";
import { AuditDiff } from "./audit-diff";
import { DateRangeFilter } from "./date-range-filter";

export interface AuditOptions {
  actions: string[];
  entities: string[];
  actors: { id: string; label: string }[];
  hasSystem: boolean;
}

type FilterKey = Exclude<keyof AuditParams, "page"> | "page";

const DANGER = new Set(["DELETE", "LOCKED", "IMPORT_UNDO"]);

export function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-xs px-1.5 text-caption font-semibold tracking-[0.02em] whitespace-nowrap tabular-nums",
        DANGER.has(action) ? "bg-danger-subtle text-danger" : "bg-sunken text-ink-2",
      )}
    >
      {action}
    </span>
  );
}

function Actor({ row }: { row: AuditRow }) {
  if (row.system)
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-3">
        <Cpu aria-hidden className="size-3.5" /> System
      </span>
    );
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-ink">{row.actor}</span>
      {row.actorSub && <span className="block truncate text-caption text-ink-3">{row.actorSub}</span>}
    </span>
  );
}

function Entity({ row }: { row: AuditRow }) {
  const id = row.entityId ? (
    <span className="inline-block max-w-36 truncate align-bottom text-caption tabular-nums" title={row.entityId}>
      #{row.entityId}
    </span>
  ) : null;
  return (
    <span className="inline-flex max-w-full items-baseline gap-1.5 whitespace-nowrap">
      <span>{row.entity}</span>
      {row.href ? (
        <Link href={row.href} onClick={(e) => e.stopPropagation()} className="text-brand-ink underline-offset-4 hover:underline">
          {id}
        </Link>
      ) : (
        <span className="text-ink-3">{id}</span>
      )}
    </span>
  );
}

function Details({ row }: { row: AuditRow }) {
  return (
    <div className="space-y-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-caption text-ink-2">
        <div className="flex gap-1.5">
          <dt className="text-caption text-ink-3">Entry</dt>
          <dd className="tabular-nums">#{row.id}</dd>
        </div>
        {row.reason && (
          <div className="flex min-w-0 gap-1.5">
            <dt className="text-caption text-ink-3">Reason</dt>
            <dd className="break-words">{row.reason}</dd>
          </div>
        )}
        {row.ip && (
          <div className="flex gap-1.5">
            <dt className="text-caption text-ink-3">IP</dt>
            <dd className="tabular-nums">{row.ip}</dd>
          </div>
        )}
      </dl>
      <AuditDiff rows={row.diff} />
    </div>
  );
}

export function AuditLogView({ rows, total, page, pageCount, params, options }: { rows: AuditRow[]; total: number; page: number; pageCount: number; params: AuditParams; options: AuditOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q ?? "");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const setParams = (patch: Partial<Record<FilterKey, string | number | undefined>>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === "all" || (k === "page" && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!("page" in patch)) next.delete("page");
    setOpen(new Set());
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === (params.q ?? "")) return;
    const id = setTimeout(() => setParams({ q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        id: "expand",
        header: () => <span className="sr-only">Expand</span>,
        cell: ({ row: { original: r } }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open.has(r.id)}
            aria-controls={`audit-${r.id}`}
            aria-label={`${open.has(r.id) ? "Hide" : "Show"} changes for entry ${r.id}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle(r.id);
            }}
          >
            <ChevronRight className={cn("transition-transform", open.has(r.id) && "rotate-90")} />
          </Button>
        ),
      },
      { id: "when", header: "Time (IST)", cell: ({ row }) => <span className="text-cell whitespace-nowrap tabular-nums">{row.original.when}</span> },
      { id: "actor", header: "Actor", cell: ({ row }) => <Actor row={row.original} /> },
      { id: "action", header: "Action", cell: ({ row }) => <ActionBadge action={row.original.action} /> },
      { id: "entity", header: "Entity", cell: ({ row }) => <Entity row={row.original} /> },
      {
        id: "reason",
        header: "Reason",
        cell: ({ row: { original: r } }) =>
          r.reason ? <span className="line-clamp-2 text-cell">{r.reason}</span> : r.changed ? <span className="text-caption text-ink-3">{r.changed} field{r.changed > 1 ? "s" : ""}</span> : <span className="text-ink-3">—</span>,
      },
      { id: "ip", header: "IP", cell: ({ row }) => <span className="text-cell text-ink-3 tabular-nums">{row.original.ip ?? "—"}</span> },
    ],
    [open],
  );

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, pageCount });
  const filtered = !!(params.from || params.to || params.actor || params.entity || params.action || params.q);
  const from = total ? (page - 1) * AUDIT_PAGE_SIZE + 1 : 0;
  const to = Math.min(page * AUDIT_PAGE_SIZE, total);

  return (
    <div className={T.tablePanel}>
      {/* Filters */}
      <div className={T.toolbar}>
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-xs sm:basis-60">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reason, ID, IP, person" className="pl-9" aria-label="Search audit log" />
        </div>
        <DateRangeFilter from={params.from} to={params.to} onChange={(f, t) => setParams({ from: f, to: t })} />
        <Select value={params.actor ?? "all"} onValueChange={(v) => setParams({ actor: v })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44" aria-label="Actor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {options.hasSystem && <SelectItem value="system">System</SelectItem>}
            {options.actors.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.entity ?? "all"} onValueChange={(v) => setParams({ entity: v })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Entity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {options.entities.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.action ?? "all"} onValueChange={(v) => setParams({ action: v })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-48" aria-label="Action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {options.actions.map((a) => (
              <SelectItem key={a} value={a} className="text-cell">
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            className="max-sm:h-11"
            onClick={() => {
              setQ("");
              setOpen(new Set());
              start(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X /> Clear
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={filtered ? "No entries match these filters" : "Nothing logged yet"}>
          {filtered ? "Try a wider date range or clear the filters." : "Sign-ins, employee changes, imports and approvals will be recorded here."}
        </EmptyState>
      ) : (
        <div className={cn("transition-opacity duration-[180ms]", pending && "opacity-60")} aria-busy={pending}>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className={T.headRow}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className={cn(T.th, "first:w-12 first:pr-0 first:pl-3", h.id === "when" && "text-right")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const expanded = open.has(row.original.id);
                  return (
                    <Fragment key={row.id}>
                      <TableRow data-state={expanded ? "selected" : undefined} className={cn(T.row, "cursor-pointer")} onClick={() => toggle(row.original.id)}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className={cn(T.td, "max-w-64 first:pr-0 first:pl-3", cell.column.id === "when" && T.num)}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                      {expanded && (
                        <TableRow className="border-line bg-sunken hover:bg-sunken">
                          <TableCell colSpan={columns.length} id={`audit-${row.original.id}`} className="px-4 pt-3 pb-5 whitespace-normal sm:pl-16">
                            <Details row={row.original} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Phone / tablet cards */}
          <ul className="divide-y divide-line lg:hidden">
            {rows.map((r) => {
              const expanded = open.has(r.id);
              return (
                <li key={r.id} className={cn(expanded && "bg-sunken")}>
                  <button type="button" className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset" aria-expanded={expanded} aria-controls={`audit-m-${r.id}`} onClick={() => toggle(r.id)}>
                    <ChevronRight className={cn("mt-0.5 size-4 shrink-0 text-ink-3 transition-transform", expanded && "rotate-90")} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <ActionBadge action={r.action} />
                        <span className="text-body">
                          {r.entity}
                          {r.entityId && <span className="ml-1 tabular-nums text-caption text-ink-3">#{r.entityId}</span>}
                        </span>
                      </span>
                      <span className="block truncate text-body">{r.system ? "System" : r.actor}</span>
                      <span className="block text-caption text-ink-3 tabular-nums">{r.when}</span>
                    </span>
                  </button>
                  {expanded && (
                    <div id={`audit-m-${r.id}`} className="space-y-3 px-4 pb-4 pl-11">
                      {r.href && (
                        <Link href={r.href} className="text-body text-brand-ink underline-offset-4 hover:underline">
                          Open {r.entity.toLowerCase()} #{r.entityId}
                        </Link>
                      )}
                      <Details row={r} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {total > 0 && (
        <div className={T.footer}>
          <span>
            <span className="tabular-nums">
              {from}–{to}
            </span>{" "}
            of <span className="tabular-nums">{total.toLocaleString("en-IN")}</span>
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={page <= 1 || pending} onClick={() => setParams({ page: page - 1 })} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-2 tabular-nums">
              {page} / {pageCount}
            </span>
            <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={page >= pageCount || pending} onClick={() => setParams({ page: page + 1 })} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
