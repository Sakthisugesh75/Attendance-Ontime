"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2, Search, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { EmptyState } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changeUserRole } from "@/lib/actions/access";
import type { AccessUserRow, listAccessUsers, RoleOption } from "@/lib/access/queries";
import * as T from "@/components/reports/table-styles";
import { cn } from "@/lib/utils";
import { ACCESS_PAGE_SIZE, type AccessParams } from "@/lib/validations/access";
import { OnlineDot, Presence, SignInStatusBadge } from "./presence";
import { blockedReason, ChangeRoleDialog, UserActions, type ActionActor } from "./user-actions";

type List = Awaited<ReturnType<typeof listAccessUsers>>;

const STATUS_FILTERS = [
  { key: "all", label: "Any status" },
  { key: "online", label: "Online now" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Waiting for first sign-in" },
  { key: "locked", label: "Locked" },
  { key: "disabled", label: "Disabled" },
] as const;

const formatPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p);

function Person({ u }: { u: AccessUserRow }) {
  return (
    <Link href={`/access/users/${u.id}`} className="group/name flex min-w-0 items-center gap-3 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <span className="relative shrink-0">
        <EmployeeAvatar name={u.name} photo={u.photo} className="size-8" />
        {u.online && <OnlineDot className="absolute -right-0.5 -bottom-0.5" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink group-hover/name:underline">{u.name}</span>
        <span className="block truncate text-caption text-ink-3">
          {u.code ? (
            <>
              <span className="tabular-nums">{u.code}</span>
              {u.department ? ` · ${u.department}` : ""}
            </>
          ) : (
            "No employee record"
          )}
        </span>
      </span>
    </Link>
  );
}

function SignInIds({ u }: { u: AccessUserRow }) {
  return (
    <span className="block min-w-0 text-cell">
      {u.username && <span className="block truncate tabular-nums">@{u.username}</span>}
      {u.email && <span className="block truncate">{u.email}</span>}
      {u.phone && <span className="tabular-nums block text-ink-3">{formatPhone(u.phone)}</span>}
      {!u.username && !u.email && !u.phone && <span className="text-ink-3">—</span>}
    </span>
  );
}

/** Role picker in the row. Plain changes save straight away; giving or removing Super Admin asks first. */
function InlineRole({ u, roles, actor }: { u: AccessUserRow; roles: RoleOption[]; actor: ActionActor }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmRole, setConfirmRole] = useState<number | null>(null);
  const blocked = blockedReason(actor, u, "role");
  const choices = roles.filter((r) => actor.isSuperAdmin || !r.isSuperAdmin || r.id === u.roleId);

  const pick = (value: string) => {
    const role = roles.find((r) => String(r.id) === value);
    if (!role || role.id === u.roleId) return;
    if (role.isSuperAdmin || u.isSuperAdmin) return setConfirmRole(role.id);
    start(async () => {
      const res = await changeUserRole(u.id, role.id);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.message);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Select value={u.roleId ? String(u.roleId) : undefined} onValueChange={pick} disabled={!!blocked || pending}>
          <SelectTrigger size="sm" className="w-40 max-lg:h-11" aria-label={`Role for ${u.name}`} title={blocked ?? undefined}>
            <SelectValue placeholder={u.roleName} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending && <Loader2 className="size-3.5 animate-spin text-ink-3" />}
      </div>
      <ChangeRoleDialog open={confirmRole !== null} onOpenChange={(o) => !o && setConfirmRole(null)} user={u} actor={actor} roles={roles} initialRoleId={confirmRole} />
    </>
  );
}

export function UsersView({ list, roles, params, actor }: { list: List; roles: RoleOption[]; params: AccessParams; actor: ActionActor }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q);

  const setParams = (patch: Partial<Record<"q" | "role" | "status" | "page", string | number | undefined>>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "users");
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === "all" || (k === "page" && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!("page" in patch)) next.delete("page");
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  useEffect(() => {
    if (q === params.q) return;
    const id = setTimeout(() => setParams({ q }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const columns = useMemo<ColumnDef<AccessUserRow>[]>(
    () => [
      { id: "person", header: "Person", cell: ({ row }) => <Person u={row.original} /> },
      { id: "signin", header: "Signs in with", cell: ({ row }) => <SignInIds u={row.original} /> },
      { id: "role", header: "Role", cell: ({ row }) => <InlineRole u={row.original} roles={roles} actor={actor} /> },
      { id: "status", header: "Status", cell: ({ row }) => <SignInStatusBadge status={row.original.status} lockedUntil={row.original.lockedUntil} /> },
      {
        id: "last",
        header: "Last sign-in",
        cell: ({ row: { original: u } }) =>
          u.lastLogin ? (
            <span className="block text-cell">
              <span className="block whitespace-nowrap text-ink-2 tabular-nums">{u.lastLogin}</span>
              <Presence online={u.online} lastSeenAgo={u.lastSeenAgo} />
            </span>
          ) : (
            <span className="text-cell text-ink-3">Never</span>
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <UserActions user={row.original} actor={actor} roles={roles} />,
      },
    ],
    [roles, actor],
  );

  const table = useReactTable({ data: list.rows, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, pageCount: list.pageCount });
  const filtered = !!(params.q || params.role || params.status);
  const from = list.total ? (list.page - 1) * ACCESS_PAGE_SIZE + 1 : 0;
  const to = Math.min(list.page * ACCESS_PAGE_SIZE, list.total);
  const statusCount = (key: (typeof STATUS_FILTERS)[number]["key"]) => (key === "all" ? list.counts.all : list.counts[key]);

  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-card">
      {/* Toolbar */}
      <div className={T.toolbar}>
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-sm sm:basis-60">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, username, email or phone" className="pl-9" aria-label="Search users" />
        </div>
        <Select value={params.role ? String(params.role) : "all"} onValueChange={(v) => setParams({ role: v })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44" aria-label="Role filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.status ?? "all"} onValueChange={(v) => setParams({ status: v })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-56" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label} <span className="tabular-nums ml-1 text-caption text-ink-3">{statusCount(s.key)}</span>
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
              start(() => router.replace(`${pathname}?tab=users`, { scroll: false }));
            }}
          >
            <X /> Clear
          </Button>
        )}
        <span className="ml-auto hidden items-center gap-1.5 text-caption text-ink-3 lg:inline-flex">
          {list.counts.online > 0 && <OnlineDot />}
          <span className="tabular-nums">{list.counts.online}</span> online now
        </span>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState icon={UsersRound} title={filtered ? "No one matches these filters" : "No sign-in accounts yet"}>
          {filtered ? "Try a different search or clear the filters." : "Give employees sign-in from their profile on the Employees page."}
        </EmptyState>
      ) : (
        <div className={cn("transition-opacity duration-[180ms]", pending && "opacity-60")} aria-busy={pending}>
          {/* Desktop */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className={T.headRow}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className={T.th}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-testid="access-user-row" className={cn(T.row, !row.original.isActive && "[&_td]:text-ink-3")}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn(T.td, "max-w-64 last:w-12 last:py-2 last:pl-0")}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phone / tablet */}
          <ul className="divide-y divide-line lg:hidden">
            {list.rows.map((u) => (
              <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Person u={u} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-11">
                    <span className="inline-flex h-[22px] items-center rounded-xs bg-sunken px-2 text-caption text-ink-2">{u.roleName}</span>
                    <SignInStatusBadge status={u.status} lockedUntil={u.lockedUntil} />
                    <Presence online={u.online} lastSeenAgo={u.lastSeenAgo} />
                  </div>
                </div>
                <UserActions user={u} actor={actor} roles={roles} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {list.total > 0 && (
        <div className={T.footer}>
          <span>
            <span className="tabular-nums">
              {from}–{to}
            </span>{" "}
            of <span className="tabular-nums">{list.total}</span>
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={list.page <= 1 || pending} onClick={() => setParams({ page: list.page - 1 })} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-2 tabular-nums">
              {list.page} / {list.pageCount}
            </span>
            <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled={list.page >= list.pageCount || pending} onClick={() => setParams({ page: list.page + 1 })} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
