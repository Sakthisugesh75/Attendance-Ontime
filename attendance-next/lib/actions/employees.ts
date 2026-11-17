"use server";

import { randomInt } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assignAccessRole } from "@/lib/access/assign";
import { recomputeRange } from "@/lib/attendance/service";
import { writeAudit } from "@/lib/audit";
import { nextEmployeeCode } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden, hasPermission, scopeEmployeeIds, type SessionUser } from "@/lib/session";
import { addDays, dbToYmd, istDate, ymdToDb } from "@/lib/time";
import { employeeSchema, type EmployeeInput, type EmployeeValues } from "@/lib/validations/employee";

export type EmployeeResult =
  | { ok: true; id: number; message: string; tempPassword?: string }
  | { ok: false; error: string; field?: string };

const STORAGE = path.join(process.cwd(), "storage");

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

function fail(error: string, field?: string): EmployeeResult {
  return { ok: false, error, field };
}

/** Maps unique-index clashes to a field-level message. */
function uniqueError(err: unknown): EmployeeResult | null {
  const e = err as { code?: string; meta?: { target?: string | string[] } };
  if (e?.code !== "P2002") return null;
  const target = String(e.meta?.target ?? "");
  if (target.includes("email")) return fail("Another sign-in already uses this email.", "email");
  if (target.includes("phone")) return fail("Another sign-in already uses this phone number.", "phone");
  if (target.includes("code")) return fail("That employee code was just taken. Try again.");
  return fail("That value is already in use.");
}

// ---- Who may do what to whom ------------------------------------------------

type RoleRow = { id: number; name: string; systemKey: string | null };
type Account = { id: number; role: string; accessRoleId: number | null; accessRole: RoleRow | null } | null;

class BadRole extends Error {}

/** The role picked in the form (null = the built-in Employee role). */
async function resolveRole(accessRoleId: number | null): Promise<RoleRow> {
  const select = { id: true, name: true, systemKey: true } as const;
  const role = accessRoleId
    ? await prisma.accessRole.findUnique({ where: { id: accessRoleId }, select })
    : await prisma.accessRole.findUnique({ where: { systemKey: "EMPLOYEE" }, select });
  if (!role) throw new BadRole("Pick a valid role.");
  return role;
}

/**
 * Anyone with employees.manage may give the built-in Employee role; any other role needs
 * access.manage; the Super Admin role only a Super Admin can give.
 */
function checkAssign(actor: SessionUser, role: RoleRow) {
  if (role.systemKey === "SUPER_ADMIN") {
    if (!actor.isSuperAdmin) throw new Forbidden("Only a Super Admin can give someone the Super Admin role.");
  } else if (role.systemKey !== "EMPLOYEE" && !hasPermission(actor, "access.manage")) {
    throw new Forbidden("Only people who can manage access can give a role other than Employee.");
  }
}

/** A sign-in with more than the built-in Employee role. */
const privileged = (u: NonNullable<Account>) => u.role === "SUPER_ADMIN" || (u.accessRole ? u.accessRole.systemKey !== "EMPLOYEE" : u.role !== "EMPLOYEE");
const roleNameOf = (u: NonNullable<Account>) => (u.role === "SUPER_ADMIN" ? "Super Admin" : (u.accessRole?.name ?? "Employee"));

/** Only a Super Admin may change a Super Admin's account (or the employee record holding it). */
function checkSuperAdminAccount(actor: SessionUser, user: Account) {
  if (user?.role === "SUPER_ADMIN" && !actor.isSuperAdmin) throw new Forbidden("Only a Super Admin can change a Super Admin's account.");
}

/** Reset password / remove: accounts with more than the Employee role need access.manage. */
function checkAccountAdmin(actor: SessionUser, user: Account, what: string) {
  checkSuperAdminAccount(actor, user);
  if (user && privileged(user) && !hasPermission(actor, "access.manage")) {
    throw new Forbidden(`Only people who can manage access can ${what} someone with the ${roleNameOf(user)} role.`);
  }
}

/** Employees outside the actor's reach can't be seen or changed. Returns the reach (null = everyone). */
async function checkReach(actor: SessionUser, employeeId: number) {
  const reach = await scopeEmployeeIds(actor);
  if (reach && !reach.includes(employeeId)) throw new Forbidden("That employee is outside your team.");
  return reach;
}

async function lookups(tx: Prisma.TransactionClient, v: EmployeeValues) {
  const [department, designation] = await Promise.all([
    v.department ? tx.department.upsert({ where: { name: v.department }, create: { name: v.department }, update: {} }) : null,
    v.designation ? tx.designation.upsert({ where: { name: v.designation }, create: { name: v.designation }, update: {} }) : null,
  ]);
  return { departmentId: department?.id ?? null, designationId: designation?.id ?? null };
}

async function validateRefs(v: EmployeeValues, selfId?: number) {
  if (v.managerId) {
    if (v.managerId === selfId) return fail("Someone can't report to themselves.", "managerId");
    const m = await prisma.employee.findFirst({ where: { id: v.managerId, deletedAt: null } });
    if (!m) return fail("Pick a valid reporting manager.", "managerId");
  }
  if (!(await prisma.shift.findUnique({ where: { id: v.shiftId } }))) return fail("Pick a valid shift.", "shiftId");
  return null;
}

const snapshot = (e: { fullName: string; phone: string | null; email: string | null; dateOfBirth: Date | null; joiningDate: Date; exitDate: Date | null; status: string; managerId: number | null; departmentId: number | null; designationId: number | null; reportRequired: boolean | null }) => ({
  fullName: e.fullName,
  phone: e.phone,
  email: e.email,
  dateOfBirth: e.dateOfBirth ? dbToYmd(e.dateOfBirth) : null,
  joiningDate: dbToYmd(e.joiningDate),
  exitDate: e.exitDate ? dbToYmd(e.exitDate) : null,
  status: e.status,
  managerId: e.managerId,
  departmentId: e.departmentId,
  designationId: e.designationId,
  reportRequired: e.reportRequired,
});

export async function createEmployee(input: EmployeeInput): Promise<EmployeeResult> {
  try {
    const actor = await actionUser("employees.manage");
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;
    const role = v.login.enabled ? await resolveRole(v.login.accessRoleId) : null;
    if (role) checkAssign(actor, role);
    // A team-scoped manager can only add people to their own team.
    const reach = await scopeEmployeeIds(actor);
    if (reach && (!v.managerId || !reach.includes(v.managerId))) return fail("Pick a reporting manager from your team.", "managerId");
    const refError = await validateRefs(v);
    if (refError) return refError;

    const password = v.login.enabled ? tempPassword() : undefined;
    const employee = await prisma.$transaction(async (tx) => {
      const { departmentId, designationId } = await lookups(tx, v);
      const user = password
        ? await tx.user.create({
            data: {
              name: v.fullName,
              email: v.email || null,
              phone: v.phone || null,
              role: "EMPLOYEE",
              passwordHash: await bcrypt.hash(password, 10),
              mustChangePassword: true,
            },
          })
        : null;
      if (user && role) await assignAccessRole(tx, user.id, role.id);
      const created = await tx.employee.create({
        data: {
          code: await nextEmployeeCode(tx),
          fullName: v.fullName,
          phone: v.phone || null,
          email: v.email || null,
          dateOfBirth: v.dateOfBirth ? ymdToDb(v.dateOfBirth) : null,
          joiningDate: ymdToDb(v.joiningDate),
          exitDate: v.exitDate ? ymdToDb(v.exitDate) : null,
          status: v.status,
          managerId: v.managerId,
          reportRequired: v.reportRequired === "YES" ? true : v.reportRequired === "NO" ? false : null,
          departmentId,
          designationId,
          userId: user?.id ?? null,
          shifts: { create: { shiftId: v.shiftId, effectiveFrom: ymdToDb(v.joiningDate) } },
        },
      });
      await writeAudit({ actorId: actor.id, action: "CREATE", entity: "Employee", entityId: created.id, after: { ...snapshot(created), code: created.code, shiftId: v.shiftId, login: role?.name ?? null } }, tx);
      return created;
    });

    // Back-dated joining: fill in the past days (absent / holiday / weekly off).
    await recomputeRange(employee.id, v.joiningDate, istDate());
    revalidatePath("/employees");
    return { ok: true, id: employee.id, message: `${employee.fullName} added as ${employee.code}`, tempPassword: password };
  } catch (err) {
    if (err instanceof Forbidden || err instanceof BadRole) return fail(err.message);
    const unique = uniqueError(err);
    if (unique) return unique;
    console.error("createEmployee failed", err);
    return fail("Could not save the employee. Try again.");
  }
}

export async function updateEmployee(id: number, input: EmployeeInput): Promise<EmployeeResult> {
  try {
    const actor = await actionUser("employees.manage");
    z.number().int().positive().parse(id);
    const reach = await checkReach(actor, id);
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;

    const before = await prisma.employee.findFirst({
      where: { id, deletedAt: null },
      include: { user: { include: { accessRole: { select: { id: true, name: true, systemKey: true } } } }, shifts: { orderBy: { effectiveFrom: "desc" } } },
    });
    if (!before) return fail("This employee no longer exists.");
    checkSuperAdminAccount(actor, before.user);
    if (reach && v.managerId !== before.managerId && (!v.managerId || !reach.includes(v.managerId))) return fail("Pick a reporting manager from your team.", "managerId");

    // Sign-in role: checked when a sign-in is given, turned back on, or its role changes.
    const employeeRole = await resolveRole(null);
    const currentRoleId = before.user ? (before.user.accessRoleId ?? (before.user.role === "EMPLOYEE" ? employeeRole.id : null)) : null;
    const role = v.login.enabled ? await resolveRole(v.login.accessRoleId) : null;
    const roleChanged = !!role && role.id !== currentRoleId;
    if (role && (roleChanged || !before.user?.isActive)) checkAssign(actor, role);
    if (before.user && before.user.id === actor.id && (roleChanged || !v.login.enabled)) throw new Forbidden("You can't change your own role or turn off your own sign-in.");
    const beforeLogin = before.user ? (before.user.isActive ? roleNameOf(before.user) : "DISABLED") : null;
    const afterLogin = role ? role.name : before.user ? "DISABLED" : null;
    const refError = await validateRefs(v, id);
    if (refError) return refError;

    const today = istDate();
    const current = before.shifts.find((s) => dbToYmd(s.effectiveFrom) <= today && (!s.effectiveTo || dbToYmd(s.effectiveTo) >= today)) ?? before.shifts[0];
    const shiftChanged = current?.shiftId !== v.shiftId;
    const shiftFrom = shiftChanged ? v.shiftEffectiveFrom || today : null;
    if (shiftFrom && shiftFrom < v.joiningDate) return fail("The new shift can't start before the joining date.", "shiftEffectiveFrom");

    let password: string | undefined;
    await prisma.$transaction(async (tx) => {
      const { departmentId, designationId } = await lookups(tx, v);

      // Sign-in account: create, update or disable.
      let userId = before.userId;
      if (v.login.enabled && !before.user) {
        password = tempPassword();
        const user = await tx.user.create({
          data: { name: v.fullName, email: v.email || null, phone: v.phone || null, role: "EMPLOYEE", passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
        });
        await assignAccessRole(tx, user.id, role!.id);
        userId = user.id;
      } else if (before.user) {
        await tx.user.update({
          where: { id: before.user.id },
          data: {
            name: v.fullName,
            email: v.email || null,
            phone: v.phone || null,
            isActive: v.login.enabled,
          },
        });
        if (role && roleChanged) {
          await assignAccessRole(tx, before.user.id, role.id);
          await writeAudit(
            { actorId: actor.id, action: "ROLE_CHANGE", entity: "User", entityId: before.user.id, before: { role: roleNameOf(before.user) }, after: { role: role.name } },
            tx,
          );
        }
      }

      const after = await tx.employee.update({
        where: { id },
        data: {
          fullName: v.fullName,
          phone: v.phone || null,
          email: v.email || null,
          dateOfBirth: v.dateOfBirth ? ymdToDb(v.dateOfBirth) : null,
          joiningDate: ymdToDb(v.joiningDate),
          exitDate: v.exitDate ? ymdToDb(v.exitDate) : null,
          status: v.status,
          managerId: v.managerId,
          reportRequired: v.reportRequired === "YES" ? true : v.reportRequired === "NO" ? false : null,
          departmentId,
          designationId,
          userId,
        },
      });

      if (shiftFrom) {
        // Close the running assignment the day before and start the new one; drop any that started later.
        await tx.shiftAssignment.deleteMany({ where: { employeeId: id, effectiveFrom: { gte: ymdToDb(shiftFrom) } } });
        await tx.shiftAssignment.updateMany({
          where: { employeeId: id, OR: [{ effectiveTo: null }, { effectiveTo: { gte: ymdToDb(shiftFrom) } }] },
          data: { effectiveTo: ymdToDb(addDays(shiftFrom, -1)) },
        });
        await tx.shiftAssignment.create({ data: { employeeId: id, shiftId: v.shiftId, effectiveFrom: ymdToDb(shiftFrom) } });
      }
      // The first assignment always starts on the joining date.
      const first = await tx.shiftAssignment.findFirst({ where: { employeeId: id }, orderBy: { effectiveFrom: "asc" } });
      if (first && dbToYmd(first.effectiveFrom) !== v.joiningDate && (!first.effectiveTo || dbToYmd(first.effectiveTo) >= v.joiningDate)) {
        await tx.shiftAssignment.update({ where: { id: first.id }, data: { effectiveFrom: ymdToDb(v.joiningDate) } });
      }

      await writeAudit(
        {
          actorId: actor.id,
          action: "UPDATE",
          entity: "Employee",
          entityId: id,
          before: { ...snapshot(before), shiftId: current?.shiftId ?? null, login: beforeLogin },
          after: { ...snapshot(after), shiftId: v.shiftId, shiftFrom, login: afterLogin },
        },
        tx,
      );
    });

    // Anything that moves employment dates or shift changes past days' results.
    const changedFrom = [
      dbToYmd(before.joiningDate) !== v.joiningDate ? [dbToYmd(before.joiningDate), v.joiningDate].sort()[0]! : null,
      (before.exitDate ? dbToYmd(before.exitDate) : "") !== v.exitDate ? [before.exitDate ? dbToYmd(before.exitDate) : today, v.exitDate || today].sort()[0]! : null,
      shiftFrom,
    ]
      .filter((d): d is string => !!d)
      .sort()[0];
    if (changedFrom) await recomputeRange(id, changedFrom, today);

    revalidatePath("/employees");
    revalidatePath(`/employees/${id}`);
    return { ok: true, id, message: "Changes saved", tempPassword: password };
  } catch (err) {
    if (err instanceof Forbidden || err instanceof BadRole) return fail(err.message);
    const unique = uniqueError(err);
    if (unique) return unique;
    console.error("updateEmployee failed", err);
    return fail("Could not save the changes. Try again.");
  }
}

/** Soft delete: hides the employee and disables their sign-in; attendance history is kept. */
export async function deleteEmployee(id: number, reason: string): Promise<EmployeeResult> {
  try {
    const actor = await actionUser("employees.manage");
    z.number().int().positive().parse(id);
    await checkReach(actor, id);
    const parsedReason = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500).safeParse(reason);
    if (!parsedReason.success) return fail(parsedReason.error.issues[0]!.message, "reason");
    const e = await prisma.employee.findFirst({ where: { id, deletedAt: null }, include: { user: { include: { accessRole: { select: { id: true, name: true, systemKey: true } } } } } });
    if (!e) return fail("This employee no longer exists.");
    checkAccountAdmin(actor, e.user, "remove");
    if (e.userId === actor.id) throw new Forbidden("You can't remove your own record.");

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: { deletedAt: new Date() } });
      // Their reports move up to nobody; HR can reassign them.
      await tx.employee.updateMany({ where: { managerId: id }, data: { managerId: null } });
      if (e.userId) await tx.user.update({ where: { id: e.userId }, data: { isActive: false } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "Employee", entityId: id, before: { code: e.code, fullName: e.fullName }, reason: parsedReason.data }, tx);
    });
    revalidatePath("/employees");
    return { ok: true, id, message: `${e.fullName} removed. Their attendance history is kept.` };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("deleteEmployee failed", err);
    return fail("Could not remove the employee. Try again.");
  }
}

/** New temporary password; they must change it at next sign-in. Also clears a lockout. */
export async function resetEmployeePassword(id: number): Promise<EmployeeResult> {
  try {
    const actor = await actionUser("employees.manage");
    z.number().int().positive().parse(id);
    await checkReach(actor, id);
    const e = await prisma.employee.findFirst({ where: { id, deletedAt: null }, include: { user: { include: { accessRole: { select: { id: true, name: true, systemKey: true } } } } } });
    if (!e?.user) return fail("This employee has no sign-in account.");
    checkAccountAdmin(actor, e.user, "reset the password of");
    const password = tempPassword();
    await prisma.user.update({
      where: { id: e.user.id },
      data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    await writeAudit({ actorId: actor.id, action: "PASSWORD_RESET_BY_ADMIN", entity: "User", entityId: e.user.id });
    revalidatePath(`/employees/${id}`);
    return { ok: true, id, message: "Temporary password created", tempPassword: password };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("resetEmployeePassword failed", err);
    return fail("Could not reset the password. Try again.");
  }
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO = 2 * 1024 * 1024;

export async function uploadEmployeePhoto(id: number, form: FormData): Promise<EmployeeResult> {
  try {
    const actor = await actionUser("employees.manage");
    z.number().int().positive().parse(id);
    await checkReach(actor, id);
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a photo.");
    const ext = PHOTO_TYPES[file.type];
    if (!ext) return fail("Use a JPG, PNG or WebP image.");
    if (file.size > MAX_PHOTO) return fail("The photo must be 2 MB or smaller.");
    const e = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!e) return fail("This employee no longer exists.");

    const rel = `photos/${id}-${Date.now()}.${ext}`;
    await mkdir(path.join(STORAGE, "photos"), { recursive: true });
    await writeFile(path.join(STORAGE, rel), Buffer.from(await file.arrayBuffer()));
    await prisma.employee.update({ where: { id }, data: { photoPath: rel } });
    if (e.photoPath) await unlink(path.join(STORAGE, e.photoPath)).catch(() => {});
    await writeAudit({ actorId: actor.id, action: "PHOTO", entity: "Employee", entityId: id, before: { photo: e.photoPath }, after: { photo: rel } });
    revalidatePath(`/employees/${id}`);
    revalidatePath("/employees");
    return { ok: true, id, message: "Photo updated" };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error("uploadEmployeePhoto failed", err);
    return fail("Could not upload the photo. Try again.");
  }
}
