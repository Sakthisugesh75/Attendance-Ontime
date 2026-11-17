"use client";

import { CircleAlert, Loader2, Lock, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, Users, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteRole } from "@/lib/actions/access";
import { PERMISSION_KEYS, SCOPE_LABEL } from "@/lib/access/permissions";
import type { RoleRow } from "@/lib/access/queries";
import type { GuardActor } from "@/lib/validations/access";
import { RoleSheet } from "./role-sheet";

export function BuiltInBadge() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-sunken pr-2 pl-1.5 text-caption text-ink-2">
      <Lock aria-hidden className="size-3" /> Built-in
    </span>
  );
}

export function RolesView({ roles, actor }: { roles: RoleRow[]; actor: GuardActor }) {
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const open = (role: RoleRow | null) => {
    setEditing(role);
    setSheetOpen(true);
  };

  const custom = roles.filter((r) => !r.systemKey).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-2">
          <span className="tabular-nums">{roles.length}</span> roles · <span className="tabular-nums">{custom}</span> custom. Everyone can always punch, see their own attendance and raise requests.
        </p>
        <Button onClick={() => open(null)}>
          <Plus /> New role
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState icon={ShieldCheck} title="No roles yet">
            The built-in roles are created by the database migration.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const readOnly = r.systemKey === "SUPER_ADMIN";
            return (
              <li key={r.id} className="flex flex-col rounded-xl bg-surface shadow-card" data-testid="role-card">
                <div className="flex items-start gap-3 p-4 pb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-title-3 text-ink">{r.name}</h3>
                      {r.systemKey && <BuiltInBadge />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-body text-ink-2">{r.description || "No description"}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mt-1 -mr-1" aria-label={`Actions for ${r.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onSelect={() => open(r)}>
                        <Pencil /> {readOnly ? "View permissions" : "Edit role"}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/access?tab=users&role=${r.id}`}>
                          <Users /> See people
                        </Link>
                      </DropdownMenuItem>
                      {!r.systemKey && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
                            <Trash2 /> Delete role
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <dl className="grid grid-cols-3 border-t border-line text-body">
                  <div className="border-r border-line px-4 py-3">
                    <dt className="text-caption text-ink-3">People</dt>
                    <dd className="mt-1">
                      <Link href={`/access?tab=users&role=${r.id}`} className="text-title-3 text-brand-ink tabular-nums underline-offset-4 hover:underline">
                        {r.userCount}
                      </Link>
                    </dd>
                  </div>
                  <div className="border-r border-line px-4 py-3">
                    <dt className="text-caption text-ink-3">Permissions</dt>
                    <dd className="mt-1">
                      <span className="text-title-3 text-ink tabular-nums">{r.permissions.length}</span>
                      <span className="text-caption text-ink-3 tabular-nums">/{PERMISSION_KEYS.length}</span>
                    </dd>
                  </div>
                  <div className="px-4 py-3">
                    <dt className="text-caption text-ink-3">Reach</dt>
                    <dd className="mt-1 leading-snug font-medium text-balance text-ink">{SCOPE_LABEL[r.scope].label}</dd>
                  </div>
                </dl>
                <p className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-caption text-ink-2" data-testid="role-daily-reports">
                  <NotebookPen aria-hidden className="size-3.5 text-ink-3" />
                  {r.dailyReports ? "Writes daily reports" : "No daily reports"}
                </p>

                <div className="mt-auto border-t border-line p-2">
                  <Button variant="ghost" className="w-full justify-center" onClick={() => open(r)}>
                    {readOnly ? "View permissions" : "Edit role"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RoleSheet open={sheetOpen} onOpenChange={setSheetOpen} role={editing} actor={actor} />
      <DeleteRoleDialog role={deleting} roles={roles} actor={actor} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DeleteRoleDialog({ role, roles, actor, onClose }: { role: RoleRow | null; roles: RoleRow[]; actor: GuardActor; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moveTo, setMoveTo] = useState<string>("");
  const [error, setError] = useState("");
  const targets = roles.filter((r) => r.id !== role?.id && (actor.isSuperAdmin || r.systemKey !== "SUPER_ADMIN"));
  const needsMove = !!role && role.userCount > 0;

  const close = () => {
    setMoveTo("");
    setError("");
    onClose();
  };

  const run = () =>
    start(async () => {
      if (!role) return;
      setError("");
      const res = await deleteRole(role.id, needsMove ? Number(moveTo) || null : null);
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      close();
      router.refresh();
    });

  return (
    <AlertDialog open={!!role} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-title-3 text-ink">Delete the role “{role?.name}”?</AlertDialogTitle>
          <AlertDialogDescription className="text-body text-ink-2">
            {needsMove
              ? `${role!.userCount} ${role!.userCount === 1 ? "person has" : "people have"} this role. Choose where they go; they get the new role's access on their next click.`
              : "Nobody has this role. Deleting it can't be undone, but the audit log keeps what it allowed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needsMove && (
          <div className="space-y-1.5">
            <Label htmlFor="move-to">Move them to</Label>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger id="move-to" className="w-full">
                <SelectValue placeholder="Pick a role" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={run} disabled={pending || (needsMove && !moveTo)}>
            {pending && <Loader2 className="animate-spin" />}
            {needsMove ? "Move and delete" : "Delete role"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
