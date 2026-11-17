"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assignAccessRole } from "@/lib/access/assign";
import { cleanPermissions, type Scope } from "@/lib/access/permissions";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden, type SessionUser } from "@/lib/session";
import { diffPermissions, grantError, roleDeleteError, roleEditError, roleSchema, userActionError, type RoleInput, type UserOp } from "@/lib/validations/access";

export type AccessResult = { ok: true; message: string; id?: number; tempPassword?: string } | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string): AccessResult => ({ ok: false, error, field });
const id = z.number().int().positive();

function handle(err: unknown, what: string): AccessResult {
  if (err instanceof Forbidden) return fail(err.message);
  if (err instanceof GuardError) return fail(err.message);
  const e = err as { code?: string; meta?: { target?: string | string[] } };
  if (e?.code === "P2002") return fail("Another role already has this name.", "name");
  console.error(`${what} failed`, err);
  return fail("Something went wrong. Try again.");
}

/** A guard-rail refusal raised inside a transaction (rolls it back). */
class GuardError extends Error {}

function revalidate(userId?: number) {
  revalidatePath("/access");
  if (userId) revalidatePath(`/access/users/${userId}`);
}

/** 10 characters, no look-alikes (0/O, 1/l/I), always with a letter and a digit. */
function tempPassword(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)]!, digits[randomInt(digits.length)]!];
  while (chars.length < 10) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

const roleSnapshot = (r: { name: string; description: string; scope: Scope; permissions: unknown; dailyReports: boolean }) => ({
  name: r.name,
  description: r.description,
  scope: r.scope,
  dailyReports: r.dailyReports,
  permissions: cleanPermissions(r.permissions),
});

// ---- Roles --------------------------------------------------------------------------

const OWN_ROLE = "You can't change the role you have yourself. Ask a Super Admin.";

/** Editing or deleting the role you hold would change your own access; only Super Admins (whose access never depends on it) may. */
async function holdsRole(actor: SessionUser, roleId: number) {
  if (actor.isSuperAdmin) return false;
  const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { accessRoleId: true } });
  return me?.accessRoleId === roleId;
}

export async function createRole(input: RoleInput): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;
    const grant = grantError(actor, v.permissions, v.scope);
    if (grant) return fail(grant);

    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.accessRole.create({ data: { name: v.name, description: v.description, scope: v.scope, permissions: cleanPermissions(v.permissions), dailyReports: v.dailyReports } });
      await writeAudit({ actorId: actor.id, action: "ROLE_CREATE", entity: "AccessRole", entityId: created.id, after: roleSnapshot(created) }, tx);
      return created;
    });
    revalidate();
    return { ok: true, id: role.id, message: `Role "${role.name}" created` };
  } catch (err) {
    return handle(err, "createRole");
  }
}

export async function updateRole(roleId: number, input: RoleInput): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    id.parse(roleId);
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;

    const before = await prisma.accessRole.findUnique({ where: { id: roleId } });
    if (!before) return fail("This role no longer exists.");
    const editError = roleEditError(before, v);
    if (editError) return fail(editError, editError.includes("renamed") ? "name" : undefined);
    const grant = grantError(actor, v.permissions, v.scope);
    if (grant) return fail(grant);
    if (await holdsRole(actor, roleId)) return fail(OWN_ROLE);

    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.accessRole.update({
        where: { id: roleId },
        data: { name: v.name, description: v.description, scope: v.scope, permissions: cleanPermissions(v.permissions), dailyReports: v.dailyReports },
      });
      const { added, removed } = diffPermissions(cleanPermissions(before.permissions), cleanPermissions(updated.permissions));
      await writeAudit(
        { actorId: actor.id, action: "ROLE_UPDATE", entity: "AccessRole", entityId: roleId, before: roleSnapshot(before), after: { ...roleSnapshot(updated), added, removed } },
        tx,
      );
      return updated;
    });
    revalidate();
    return { ok: true, id: after.id, message: `Role "${after.name}" saved. People with it get the change on their next click.` };
  } catch (err) {
    return handle(err, "updateRole");
  }
}

/** Deletes a custom role. When people still have it, `moveToRoleId` says where they go (in the same transaction). */
export async function deleteRole(roleId: number, moveToRoleId?: number | null): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    id.parse(roleId);
    if (moveToRoleId != null) id.parse(moveToRoleId);

    const moved = await prisma.$transaction(async (tx) => {
      const role = await tx.accessRole.findUnique({ where: { id: roleId }, include: { users: { select: { id: true } } } });
      if (!role) throw new GuardError("This role no longer exists.");
      if (!actor.isSuperAdmin && role.users.some((u) => u.id === actor.id)) throw new GuardError(OWN_ROLE);
      const moveTo = moveToRoleId ? await tx.accessRole.findUnique({ where: { id: moveToRoleId } }) : null;
      if (moveToRoleId && !moveTo) throw new GuardError("The role to move people to no longer exists.");
      const error = roleDeleteError({ id: role.id, systemKey: role.systemKey, userCount: role.users.length }, moveTo, actor);
      if (error) throw new GuardError(error);

      for (const u of role.users) {
        await assignAccessRole(tx, u.id, moveTo!.id);
        await writeAudit({ actorId: actor.id, action: "USER_ROLE", entity: "User", entityId: u.id, before: { role: role.name }, after: { role: moveTo!.name }, reason: `Role "${role.name}" deleted` }, tx);
      }
      await tx.accessRole.delete({ where: { id: roleId } });
      await writeAudit(
        { actorId: actor.id, action: "ROLE_DELETE", entity: "AccessRole", entityId: roleId, before: roleSnapshot(role), after: moveTo ? { movedUsers: role.users.length, movedTo: moveTo.name } : undefined },
        tx,
      );
      return { name: role.name, count: role.users.length, to: moveTo?.name };
    });
    revalidate();
    return { ok: true, message: moved.count ? `Role "${moved.name}" deleted; ${moved.count} moved to ${moved.to}` : `Role "${moved.name}" deleted` };
  } catch (err) {
    return handle(err, "deleteRole");
  }
}

// ---- Users --------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/** Loads the target and applies the guard rails for `op`, inside the transaction that makes the change. */
async function guardedTarget(tx: Tx, actor: SessionUser, userId: number, op: UserOp, newRoleIsSuperAdmin?: boolean) {
  const target = await tx.user.findUnique({ where: { id: userId }, include: { accessRole: { select: { name: true } }, employee: { select: { fullName: true } } } });
  if (!target) throw new GuardError("This account no longer exists.");
  const activeSuperAdmins = await tx.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
  const error = userActionError(actor, { id: target.id, isSuperAdmin: target.role === "SUPER_ADMIN", isActive: target.isActive }, op, { activeSuperAdmins, newRoleIsSuperAdmin });
  if (error) throw new GuardError(error);
  const name = target.employee?.fullName || target.name || target.username || target.email || `User #${target.id}`;
  const roleName = target.role === "SUPER_ADMIN" ? "Super Admin" : (target.accessRole?.name ?? "Employee");
  return { target, name, roleName };
}

export async function changeUserRole(userId: number, roleId: number): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    id.parse(userId);
    id.parse(roleId);
    const result = await prisma.$transaction(async (tx) => {
      const role = await tx.accessRole.findUnique({ where: { id: roleId } });
      if (!role) throw new GuardError("This role no longer exists.");
      const { target, name, roleName } = await guardedTarget(tx, actor, userId, "role", role.systemKey === "SUPER_ADMIN");
      if (target.accessRoleId === role.id) return { name, role: role.name, unchanged: true };
      await assignAccessRole(tx, userId, role.id);
      await writeAudit({ actorId: actor.id, action: "USER_ROLE", entity: "User", entityId: userId, before: { role: roleName }, after: { role: role.name } }, tx);
      return { name, role: role.name, unchanged: false };
    });
    revalidate(userId);
    return { ok: true, message: result.unchanged ? `${result.name} already has ${result.role}` : `${result.name} is now ${result.role}` };
  } catch (err) {
    return handle(err, "changeUserRole");
  }
}

/** Disabling also bumps the session version, so re-enabling later doesn't revive old sessions. */
export async function setUserActive(userId: number, active: boolean): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    id.parse(userId);
    z.boolean().parse(active);
    const name = await prisma.$transaction(async (tx) => {
      const { target, name } = await guardedTarget(tx, actor, userId, active ? "enable" : "disable");
      if (target.isActive === active) return name;
      await tx.user.update({ where: { id: userId }, data: active ? { isActive: true } : { isActive: false, sessionVersion: { increment: 1 } } });
      await writeAudit({ actorId: actor.id, action: active ? "USER_ENABLE" : "USER_DISABLE", entity: "User", entityId: userId, before: { isActive: target.isActive }, after: { isActive: active } }, tx);
      return name;
    });
    revalidate(userId);
    return { ok: true, message: active ? `${name} can sign in again` : `${name} can no longer sign in and was signed out` };
  } catch (err) {
    return handle(err, "setUserActive");
  }
}

export async function unlockUser(userId: number): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    id.parse(userId);
    const name = await prisma.$transaction(async (tx) => {
      const { target, name } = await guardedTarget(tx, actor, userId, "unlock");
      await tx.user.update({ where: { id: userId }, data: { lockedUntil: null, failedLoginCount: 0 } });
      await writeAudit(
        { actorId: actor.id, action: "USER_UNLOCK", entity: "User", entityId: userId, before: { lockedUntil: target.lockedUntil, failedLoginCount: target.failedLoginCount }, after: { lockedUntil: null, failedLoginCount: 0 } },
        tx,
      );
      return name;
    });
    revalidate(userId);
    return { ok: true, message: `${name} is unlocked` };
  } catch (err) {
    return handle(err, "unlockUser");
  }
}

/** New temporary password (shown once), forced change on next sign-in, unlocked, and signed out everywhere. */
export async function resetUserPassword(userId: number): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    id.parse(userId);
    const password = tempPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const name = await prisma.$transaction(async (tx) => {
      const { target, name } = await guardedTarget(tx, actor, userId, "reset");
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true, lockedUntil: null, failedLoginCount: 0, sessionVersion: { increment: 1 } },
      });
      await writeAudit(
        {
          actorId: actor.id,
          action: "PASSWORD_RESET_BY_ADMIN",
          entity: "User",
          entityId: userId,
          before: { mustChangePassword: target.mustChangePassword, locked: !!(target.lockedUntil && target.lockedUntil > new Date()), sessionVersion: target.sessionVersion },
          after: { mustChangePassword: true, locked: false, sessionVersion: target.sessionVersion + 1 },
        },
        tx,
      );
      return name;
    });
    revalidate(userId);
    return { ok: true, message: `New temporary password for ${name}`, tempPassword: password };
  } catch (err) {
    return handle(err, "resetUserPassword");
  }
}

export async function signOutEverywhere(userId: number): Promise<AccessResult> {
  try {
    const actor = await actionUser("access.manage");
    id.parse(userId);
    const name = await prisma.$transaction(async (tx) => {
      const { target, name } = await guardedTarget(tx, actor, userId, "signout");
      await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
      await writeAudit({ actorId: actor.id, action: "SIGN_OUT_EVERYWHERE", entity: "User", entityId: userId, before: { sessionVersion: target.sessionVersion }, after: { sessionVersion: target.sessionVersion + 1 } }, tx);
      return name;
    });
    revalidate(userId);
    return { ok: true, message: `${name} was signed out on every device` };
  } catch (err) {
    return handle(err, "signOutEverywhere");
  }
}
