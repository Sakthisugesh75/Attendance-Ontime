"use client";

import { Laptop, Plus, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import * as T from "@/components/reports/table-styles";
import type { EntryEmployee } from "@/components/requests/employee-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AssetRow } from "@/lib/assets";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CONDITION_LABEL, type AssetListParams, type AssetStatusKey } from "@/lib/validations/assets";
import { formatRupees } from "@/lib/validations/expenses";
import { AssetDetailSheet } from "./asset-detail-sheet";
import { AssetSheet } from "./asset-sheet";
import { AssetStatusChip } from "./asset-status-chip";

const TABS: { key: "ALL" | AssetStatusKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ASSIGNED", label: "With employees" },
  { key: "AVAILABLE", label: "In store" },
  { key: "REPAIR", label: "In repair" },
  { key: "RETIRED", label: "Retired" },
];

type Register = { rows: AssetRow[]; counts: Record<"ALL" | AssetStatusKey, number>; categories: string[]; value: number };

export function AssetsView({
  register,
  mine,
  params,
  employees,
  nextTag,
}: {
  /** Full register (assets.manage) */
  register: Register | null;
  /** Assets the signed-in employee holds */
  mine: AssetRow[] | null;
  params: AssetListParams;
  employees: EntryEmployee[];
  nextTag: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const rows = register?.rows ?? mine ?? [];
  const detail = rows.find((r) => r.id === detailId) ?? null;
  const canManage = !!register;

  const go = (patch: Partial<Record<keyof AssetListParams, string | undefined>>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (k === "status" && v === "ALL")) next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === params.q) return;
    const id = setTimeout(() => go({ q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const openForm = (a: AssetRow | null) => {
    setEditing(a);
    setFormOpen(true);
  };
  const filtered = !!(params.q || params.category || params.status !== "ALL");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={canManage ? "Finance & assets" : undefined}
        title={canManage ? "Assets" : "My assets"}
        description={
          canManage ? (
            <>
              <span className="tabular-nums">{register!.counts.ALL}</span> assets · <span className="tabular-nums">{register!.counts.ASSIGNED}</span> with employees · worth{" "}
              <span className="tabular-nums">{formatRupees(register!.value)}</span>
            </>
          ) : (
            "Company things you have now. Return them to HR when you leave."
          )
        }
        actions={
          canManage && (
            <Button className="h-11 sm:h-10" onClick={() => openForm(null)}>
              <Plus /> Add asset
            </Button>
          )
        }
      />

      <section className={T.tablePanel}>
        {canManage && (
          <>
            <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2 [scrollbar-width:none] sm:px-3" role="tablist" aria-label="Status">
              {TABS.map((t) => {
                const active = params.status === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => go({ status: t.key })}
                    className={cn(
                      "relative flex h-11 items-center gap-2 rounded-xs px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10",
                      active ? "text-ink" : "text-ink-3 hover:text-ink",
                    )}
                  >
                    {t.label}
                    <span className="rounded-full bg-sunken px-1.5 text-caption text-ink-2 tabular-nums">{register!.counts[t.key]}</span>
                    {active && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 bg-ink" />}
                  </button>
                );
              })}
            </div>
            <div className={T.toolbar}>
              <div className={T.searchBox}>
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag, name, serial or person" className="pl-9" aria-label="Search assets" />
              </div>
              <Select value={params.category || "all"} onValueChange={(v) => go({ category: v === "all" ? undefined : v })}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {register!.categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filtered && (
                <Button
                  variant="ghost"
                  className="h-11 text-ink-2 sm:h-8"
                  onClick={() => {
                    setQ("");
                    start(() => router.replace(pathname, { scroll: false }));
                  }}
                >
                  <X /> Clear
                </Button>
              )}
            </div>
          </>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Laptop}
            art={canManage ? undefined : "thumbs"}
            title={canManage ? (filtered ? "No assets match" : "No assets yet") : "Nothing with you"}
            action={
              canManage &&
              !filtered && (
                <Button onClick={() => openForm(null)}>
                  <Plus /> Add asset
                </Button>
              )
            }
          >
            {canManage ? (filtered ? "Try a different search or clear the filters." : "Add laptops, phones, SIM and ID cards so you know who has what.") : "When HR hands you a laptop, phone or card, it shows up here."}
          </EmptyState>
        ) : (
          <div className={cn("transition-opacity duration-[180ms]", pending && "opacity-60")} aria-busy={pending || undefined}>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className={T.headRow}>
                  <TableHead className={T.th}>Tag</TableHead>
                  <TableHead className={T.th}>Asset</TableHead>
                  <TableHead className={T.th}>Status</TableHead>
                  <TableHead className={T.th}>With</TableHead>
                  <TableHead className={cn(T.th, "text-right")}>Since</TableHead>
                  <TableHead className={T.th}>Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} className={cn(T.row, "cursor-pointer", a.status === "RETIRED" && "[&_td]:text-ink-3")} onClick={() => setDetailId(a.id)}>
                    <TableCell className={T.td}>
                      <button type="button" className="rounded-xs text-caption font-semibold tracking-[0.02em] text-ink-2 tabular-nums outline-none [font-feature-settings:'zero'] focus-visible:ring-2 focus-visible:ring-brand" onClick={() => setDetailId(a.id)}>
                        {a.tag}
                      </button>
                    </TableCell>
                    <TableCell className={cn(T.td, "max-w-64")}>
                      <span className="block truncate font-medium text-ink">{a.name}</span>
                      <span className="block truncate text-caption text-ink-3">
                        {a.category}
                        {a.serialNo ? ` · ${a.serialNo}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className={T.td}>
                      <AssetStatusChip status={a.status} />
                    </TableCell>
                    <TableCell className={T.td}>{a.holder ? a.holder.name : <span className={T.empty}>—</span>}</TableCell>
                    <TableCell className={cn(T.td, T.num, "whitespace-nowrap")}>{a.assignedAt ? formatDate(a.assignedAt) : <span className={T.empty}>—</span>}</TableCell>
                    <TableCell className={T.td}>{CONDITION_LABEL[a.condition]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((a) => (
                <li key={a.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken" onClick={() => setDetailId(a.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink">{a.name}</span>
                      <span className="block truncate text-caption text-ink-3 tabular-nums">
                        {a.tag} · {a.category}
                        {a.holder ? ` · ${a.holder.name}` : ""}
                      </span>
                    </span>
                    <AssetStatusChip status={a.status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {canManage && <AssetSheet open={formOpen} onOpenChange={setFormOpen} asset={editing} nextTag={nextTag} categories={register!.categories} />}
      <AssetDetailSheet
        asset={detail}
        onClose={() => setDetailId(null)}
        onEdit={(a) => {
          setDetailId(null);
          openForm(a);
        }}
        employees={employees}
        canManage={canManage}
      />
    </div>
  );
}
