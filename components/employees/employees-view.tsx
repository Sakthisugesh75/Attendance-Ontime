"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, KeyRound, MoreHorizontal, RotateCcw, Search, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import * as T from "@/components/reports/table-styles";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EmployeeFormOptions, EmployeeRow, listEmployees } from "@/lib/employees";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { EmployeeListParams } from "@/lib/validations/employee";
import { EmployeeAvatar } from "./employee-avatar";
import { EmployeeSheet, type RoleAccess } from "./employee-sheet";
import { EmployeeStatusBadge } from "./employee-status";
import { LifecycleDialog, type LifecycleAction, type LifecycleTarget } from "./lifecycle-dialog";

type List = Awaited<ReturnType<typeof listEmployees>>;

const TABS = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "ON_NOTICE", label: "On notice" },
  { key: "EXITED", label: "Exited" },
  { key: "REMOVED", label: "Removed" },
] as const;


export function EmployeesView({
  list,
  params,
  options,
  departments,
  access,
  canManage,
  canSeeRemoved,
  canViewAttendance,
}: {
  list: List;
  params: EmployeeListParams;
  options: EmployeeFormOptions;
  departments: { id: number; name: string }[];
  access: RoleAccess;
  /** employees.manage: shows "Add employee" (the actions check again) */
  canManage: boolean;
  /** Shows the Removed tab (restore / delete permanently) */
  canSeeRemoved: boolean;
  /** attendance.view: links to the person's attendance */
  canViewAttendance: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleTarget | null>(null);
  const removedTab = params.status === "REMOVED";
  const act = (action: LifecycleAction, e: EmployeeRow) => setLifecycle({ action, id: e.id, fullName: e.fullName, code: e.code });

  /** Writes filters to the URL; the server re-queries. Any filter change goes back to page 1. */
  const setParams = (patch: Partial<Record<keyof EmployeeListParams, string | number | undefined>>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || (k === "status" && v === "ALL") || (k === "page" && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!("page" in patch)) next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  // Debounced search
  useEffect(() => {
    if (q === params.q) return;
    const id = setTimeout(() => setParams({ q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sortBy = (key: EmployeeListParams["sort"]) =>
    setParams({ sort: key, dir: params.sort === key && params.dir === "asc" ? "desc" : "asc" });

  const columns = useMemo<ColumnDef<EmployeeRow>[]>(
    () => [
      {
        id: "name",
        header: () => <SortHeader label="Employee" active={params.sort === "name"} dir={params.dir} onClick={() => sortBy("name")} />,
        cell: ({ row: { original: e } }) =>
          e.removedOn ? (
            <span className="flex min-w-0 items-center gap-3">
              <EmployeeAvatar name={e.fullName} photo={e.photo} className="size-7" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{e.fullName}</span>
                <span className="block truncate text-caption text-ink-3">{e.designation ?? "—"}</span>
              </span>
            </span>
          ) : (
            <Link href={`/employees/${e.id}`} className="group/name flex min-w-0 items-center gap-3 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <EmployeeAvatar name={e.fullName} photo={e.photo} className="size-7" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink group-hover/name:underline">{e.fullName}</span>
                <span className="block truncate text-caption text-ink-3">{e.designation ?? "—"}</span>
              </span>
            </Link>
          ),
      },
      {
        id: "code",
        header: () => <SortHeader label="Code" active={params.sort === "code"} dir={params.dir} onClick={() => sortBy("code")} />,
        cell: ({ row }) => <span className="text-caption font-semibold tracking-[0.02em] text-ink-2 tabular-nums [font-feature-settings:'zero']">{row.original.code}</span>,
      },
      { id: "department", header: "Department", cell: ({ row }) => row.original.department ?? <span className="text-ink-3">—</span> },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row: { original: e } }) => (
          <span className="block min-w-0">
            <span className="block tabular-nums">{e.phone ? `${e.phone.slice(0, 5)} ${e.phone.slice(5)}` : <span className="text-ink-3">—</span>}</span>
            <span className="block truncate text-caption text-ink-3">{e.email ?? ""}</span>
          </span>
        ),
      },
      { id: "manager", header: "Manager", cell: ({ row }) => row.original.manager ?? <span className="text-ink-3">—</span> },
      {
        id: "login",
        header: "Sign-in",
        cell: ({ row: { original: e } }) =>
          e.login ? (
            <span className={cn("inline-flex items-center gap-1.5", e.login === "DISABLED" ? "text-ink-3 line-through" : "text-ink-2")}>
              <KeyRound aria-hidden className="size-3.5 text-ink-3" /> {e.login === "DISABLED" ? "Disabled" : e.login}
            </span>
          ) : (
            <span className="text-ink-3">None</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row: { original: e } }) => (
          <span className="flex flex-col items-start gap-0.5">
            <EmployeeStatusBadge status={e.status} />
            {e.removedOn ? (
              <span className="text-caption text-ink-3 tabular-nums">removed {formatDate(e.removedOn)}</span>
            ) : (
              e.exitDate && e.status !== "ACTIVE" && <span className="text-caption text-ink-3 tabular-nums">until {formatDate(e.exitDate)}</span>
            )}
          </span>
        ),
      },
      {
        id: "joined",
        header: () => <SortHeader label="Joined" active={params.sort === "joined"} dir={params.dir} onClick={() => sortBy("joined")} align="right" />,
        cell: ({ row }) => <span className="block text-right whitespace-nowrap tabular-nums">{formatDate(row.original.joiningDate)}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row: { original: e } }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-ink-2" aria-label={`Actions for ${e.fullName}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {e.removedOn ? (
                <>
                  <DropdownMenuItem onSelect={() => act("restore", e)}>
                    <RotateCcw /> Restore
                  </DropdownMenuItem>
                  {access.isSuperAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => act("purge", e)}>
                        <Trash2 /> Delete permanently
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/employees/${e.id}`}>View profile</Link>
                  </DropdownMenuItem>
                  {canManage && (
                    <DropdownMenuItem asChild>
                      <Link href={`/employees/${e.id}?edit=1`}>Edit</Link>
                    </DropdownMenuItem>
                  )}
                  {canViewAttendance && (
                    <DropdownMenuItem asChild>
                      <Link href={`/attendance?employee=${e.id}`}>Attendance</Link>
                    </DropdownMenuItem>
                  )}
                  {canManage && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => act("remove", e)}>
                        <UserMinus /> Remove
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.sort, params.dir, canManage, canViewAttendance, access.isSuperAdmin],
  );

  const table = useReactTable({ data: list.rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, manualSorting: true, pageCount: list.pageCount });
  const filtered = !!(params.q || params.department || params.status !== "ALL");
  const from = list.total ? (params.page - 1) * 20 + 1 : 0;
  const to = Math.min(params.page * 20, list.total);

  /** Row click opens the profile (the name link stays the accessible way in). */
  const openRow = (e: React.MouseEvent, id: number) => {
    if (removedTab || (e.target as HTMLElement).closest("a,button,[role=menuitem]")) return;
    router.push(`/employees/${id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description={
          <>
            <span className="tabular-nums">{list.counts.ALL}</span> people · profiles, shifts and sign-in access
          </>
        }
        actions={
          canManage && (
            <Button className="h-11 sm:h-10" onClick={() => setSheetOpen(true)}>
              <UserPlus /> Add employee
            </Button>
          )
        }
      />

      <section className={T.tablePanel}>
        {/* Status tabs (DESIGN.md §4.9) */}
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-2 [scrollbar-width:none] sm:px-3" role="tablist" aria-label="Status">
          {TABS.filter((t) => t.key !== "REMOVED" || canSeeRemoved).map((t) => {
            const active = params.status === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setParams({ status: t.key })}
                className={cn(
                  "relative flex h-11 items-center gap-2 rounded-xs px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10",
                  active ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {t.label}
                <span className="rounded-full bg-sunken px-1.5 text-caption text-ink-2 tabular-nums">{list.counts[t.key]}</span>
                {active && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 bg-ink" />}
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className={T.toolbar}>
          <div className={T.searchBox}>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, phone or email" className="pl-9" aria-label="Search employees" />
          </div>
          <Select value={params.department ? String(params.department) : "all"} onValueChange={(v) => setParams({ department: v === "all" ? undefined : v })}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name}
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

        {list.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={removedTab && !params.q ? "No removed employees" : filtered ? (params.q ? `No one matches “${params.q}”` : "No one matches these filters") : "No employees yet"}
            action={
              filtered ? (
                <Button
                  variant="outline"
                  className="h-11 sm:h-10"
                  onClick={() => {
                    setQ("");
                    start(() => router.replace(pathname, { scroll: false }));
                  }}
                >
                  Clear search
                </Button>
              ) : (
                canManage && (
                  <Button className="h-11 sm:h-10" onClick={() => setSheetOpen(true)}>
                    <UserPlus /> Add employee
                  </Button>
                )
              )
            }
          >
            {removedTab && !params.q
              ? "People you remove show up here, so you can restore them or delete them for good."
              : filtered
                ? "Try a different search or clear the filters."
                : "Add your team so they can punch in and you can track attendance."}
          </EmptyState>
        ) : (
          <div className={cn("transition-opacity duration-[180ms]", pending && "opacity-60")} aria-busy={pending || undefined}>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className={T.headRow}>
                      {hg.headers.map((h) => (
                        <TableHead key={h.id} className={cn(T.th, h.id === "joined" && "text-right", h.id === "actions" && "w-12")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className={cn(T.row, !removedTab && "cursor-pointer", row.original.status === "EXITED" && "[&_td]:text-ink-3")} onClick={(e) => openRow(e, row.original.id)}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={cn(T.td, "max-w-60", cell.column.id === "actions" && "w-12 py-2 pr-3 pl-0")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Phone cards (below 768px) */}
            <ul className="divide-y divide-line md:hidden">
              {list.rows.map((e) =>
                e.removedOn ? (
                  <li key={e.id} className="space-y-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={e.fullName} photo={e.photo} className="size-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-ink">{e.fullName}</span>
                        <span className="block truncate text-caption text-ink-3">
                          <span className="tabular-nums">{e.code}</span> · removed <span className="tabular-nums">{formatDate(e.removedOn)}</span>
                        </span>
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="h-11 flex-1" onClick={() => act("restore", e)}>
                        <RotateCcw /> Restore
                      </Button>
                      {access.isSuperAdmin && (
                        <Button variant="outline" className="h-11 flex-1 text-danger" onClick={() => act("purge", e)}>
                          <Trash2 /> Delete
                        </Button>
                      )}
                    </div>
                  </li>
                ) : (
                <li key={e.id}>
                  <Link href={`/employees/${e.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-sunken">
                    <EmployeeAvatar name={e.fullName} photo={e.photo} className="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink">{e.fullName}</span>
                      <span className="block truncate text-caption text-ink-3">
                        <span className="tabular-nums">{e.code}</span>
                        {e.department ? ` · ${e.department}` : ""}
                      </span>
                    </span>
                    <EmployeeStatusBadge status={e.status} />
                  </Link>
                </li>
                ),
              )}
            </ul>
          </div>
        )}

        {/* Pagination */}
        {list.total > 0 && (
          <div className={T.footer}>
            <span>
              <span className="tabular-nums">
                {from}–{to}
              </span>{" "}
              of <span className="tabular-nums">{list.total}</span>
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={params.page <= 1} onClick={() => setParams({ page: params.page - 1 })} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <span className="px-2 tabular-nums">
                {params.page} / {list.pageCount}
              </span>
              <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={params.page >= list.pageCount} onClick={() => setParams({ page: params.page + 1 })} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </section>

      <EmployeeSheet open={sheetOpen} onOpenChange={setSheetOpen} options={options} access={access} />
      <LifecycleDialog target={lifecycle} onClose={() => setLifecycle(null)} />
    </div>
  );
}

function SortHeader({ label, active, dir, onClick, align }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; align?: "right" }) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand",
        active && "text-ink",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <Icon aria-hidden className={cn("size-3.5", !active && "text-ink-3")} />
    </button>
  );
}
