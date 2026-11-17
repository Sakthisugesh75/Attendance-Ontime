"use client";

import { Activity, Ban, CircleAlert, KeyRound, Loader2, LogOut, MoreHorizontal, ShieldCheck, Unlock, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TempPasswordDialog } from "@/components/employees/temp-password-dialog";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeUserRole, resetUserPassword, setUserActive, signOutEverywhere, unlockUser, type AccessResult } from "@/lib/actions/access";
import type { RoleOption } from "@/lib/access/queries";
import { userActionError, type SignInStatus, type UserOp } from "@/lib/validations/access";

export interface ActionTarget {
  id: number;
  name: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  status: SignInStatus;
  roleId: number | null;
}

export interface ActionActor {
  id: number;
  isSuperAdmin: boolean;
}

type Confirm = "disable" | "enable" | "unlock" | "reset" | "signout";

/**
 * Why `op` is unavailable in the UI, or null. Mirrors the server rules; the actions re-check
 * everything (including "at least one active Super Admin", which needs a live count).
 */
export function blockedReason(actor: ActionActor, target: ActionTarget, op: UserOp, newRoleIsSuperAdmin?: boolean) {
  return userActionError(actor, target, op, { activeSuperAdmins: Number.POSITIVE_INFINITY, newRoleIsSuperAdmin });
}

const COPY: Record<Confirm, { title: (n: string) => string; body: string; cta: string; destructive: boolean }> = {
  disable: {
    title: (n) => `Disable sign-in for ${n}?`,
    body: "They are signed out on every device straight away and can't sign in until you enable them again. Their attendance history stays.",
    cta: "Disable sign-in",
    destructive: true,
  },
  enable: { title: (n) => `Let ${n} sign in again?`, body: "They can sign in with their current password.", cta: "Enable sign-in", destructive: false },
  unlock: { title: (n) => `Unlock ${n}?`, body: "Clears the failed attempts so they can try again right away.", cta: "Unlock", destructive: false },
  reset: {
    title: (n) => `Reset ${n}'s password?`,
    body: "Their current password stops working and they are signed out everywhere. You'll see a temporary password once; they must choose a new one when they sign in. This also unlocks the account.",
    cta: "Reset password",
    destructive: true,
  },
  signout: {
    title: (n) => `Sign ${n} out everywhere?`,
    body: "Every open session (phone, laptop, other browsers) ends on its next request. Their password doesn't change.",
    cta: "Sign out everywhere",
    destructive: true,
  },
};

export function UserActions({
  user,
  actor,
  roles,
  showActivityLink = true,
  layout = "menu",
}: {
  user: ActionTarget;
  actor: ActionActor;
  roles: RoleOption[];
  showActivityLink?: boolean;
  /** "menu": a ⋯ button (tables); "bar": visible buttons + menu (profile header) */
  layout?: "menu" | "bar";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [error, setError] = useState("");

  const self = actor.id === user.id;
  const can = (op: UserOp) => !blockedReason(actor, user, op);
  const roleBlocked = blockedReason(actor, user, "role");

  const run = (c: Confirm) =>
    start(async () => {
      setError("");
      let res: AccessResult;
      if (c === "disable" || c === "enable") res = await setUserActive(user.id, c === "enable");
      else if (c === "unlock") res = await unlockUser(user.id);
      else if (c === "reset") res = await resetUserPassword(user.id);
      else res = await signOutEverywhere(user.id);
      if (!res.ok) return setError(res.error);
      setConfirm(null);
      if (res.tempPassword) setTemp(res.tempPassword);
      else {
        toast.success(res.message);
        router.refresh();
      }
    });

  const items = (
    <>
      <DropdownMenuLabel className="truncate text-caption text-ink-3">{user.name}</DropdownMenuLabel>
      <DropdownMenuItem disabled={!!roleBlocked} onSelect={() => setRoleOpen(true)}>
        <ShieldCheck /> Change role
      </DropdownMenuItem>
      {user.isActive ? (
        <DropdownMenuItem disabled={!can("disable")} onSelect={() => setConfirm("disable")}>
          <Ban /> Disable sign-in
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem disabled={!can("enable")} onSelect={() => setConfirm("enable")}>
          <UserCheck /> Enable sign-in
        </DropdownMenuItem>
      )}
      {user.status === "LOCKED" && (
        <DropdownMenuItem disabled={!can("unlock")} onSelect={() => setConfirm("unlock")}>
          <Unlock /> Unlock
        </DropdownMenuItem>
      )}
      <DropdownMenuItem disabled={!can("reset")} onSelect={() => setConfirm("reset")}>
        <KeyRound /> Reset password
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!can("signout") || !user.isActive} onSelect={() => setConfirm("signout")}>
        <LogOut /> Sign out everywhere
      </DropdownMenuItem>
      {showActivityLink && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/access/users/${user.id}`}>
              <Activity /> View activity
            </Link>
          </DropdownMenuItem>
        </>
      )}
      {(self || (user.isSuperAdmin && !actor.isSuperAdmin)) && (
        <p className="max-w-56 px-2 py-1.5 text-caption text-ink-3">
          {self ? "You can't change your own role, disable or sign yourself out." : "Only a Super Admin can change a Super Admin's account."}
        </p>
      )}
    </>
  );

  const copy = confirm ? COPY[confirm] : null;

  return (
    <>
      {layout === "bar" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={!!roleBlocked} onClick={() => setRoleOpen(true)}>
            <ShieldCheck /> Change role
          </Button>
          {user.status === "LOCKED" && can("unlock") && (
            <Button variant="outline" onClick={() => setConfirm("unlock")}>
              <Unlock /> Unlock
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More account actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {items}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Account actions for ${user.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-title-3 text-ink">{copy?.title(user.name)}</AlertDialogTitle>
            <AlertDialogDescription className="text-body text-ink-2">{copy?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant={copy?.destructive ? "destructive" : "default"} disabled={pending} onClick={() => confirm && run(confirm)}>
              {pending && <Loader2 className="animate-spin" />}
              {copy?.cta}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangeRoleDialog open={roleOpen} onOpenChange={setRoleOpen} user={user} actor={actor} roles={roles} />

      <TempPasswordDialog
        password={temp}
        name={user.name}
        onClose={() => {
          setTemp(null);
          router.refresh();
        }}
      />
    </>
  );
}

/** Pick a new role, with a warning when Super Admin is given or taken away. */
export function ChangeRoleDialog({
  open,
  onOpenChange,
  user,
  actor,
  roles,
  initialRoleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ActionTarget;
  actor: ActionActor;
  roles: RoleOption[];
  initialRoleId?: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string>("");
  const [error, setError] = useState("");
  const value = picked || String(initialRoleId ?? user.roleId ?? "");
  const pickedRole = roles.find((r) => String(r.id) === value);
  const choices = roles.filter((r) => actor.isSuperAdmin || !r.isSuperAdmin);
  const unchanged = pickedRole?.id === user.roleId;
  const touchesOwner = !!pickedRole && (pickedRole.isSuperAdmin || user.isSuperAdmin) && pickedRole.id !== user.roleId;

  const close = (o: boolean) => {
    if (!o) {
      setPicked("");
      setError("");
    }
    onOpenChange(o);
  };

  const save = () =>
    start(async () => {
      if (!pickedRole) return;
      setError("");
      const res = await changeUserRole(user.id, pickedRole.id);
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      close(false);
      router.refresh();
    });

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-title-3 text-ink">Change {user.name}&apos;s role</AlertDialogTitle>
          <AlertDialogDescription className="text-body text-ink-2">The new access applies on their next click. No need to sign them out.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`role-for-${user.id}`}>Role</Label>
          <Select value={value} onValueChange={setPicked}>
            <SelectTrigger id={`role-for-${user.id}`} className="w-full">
              <SelectValue placeholder="Pick a role" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {touchesOwner && (
            <p className="rounded-md bg-st-late-tint px-3 py-2 text-caption text-st-late-fg">
              {pickedRole?.isSuperAdmin
                ? "Super Admins can do everything, including managing other admins. Only give this to someone you fully trust."
                : "This removes their Super Admin access."}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-body text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button onClick={save} disabled={pending || !pickedRole || unchanged}>
            {pending && <Loader2 className="animate-spin" />}
            Save role
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
