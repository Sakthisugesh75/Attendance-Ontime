import "server-only";
import type { Prisma } from "@prisma/client";
import { diffAudit, type DiffRow } from "@/components/audit/audit-utils";
import { cleanPermissions, PERMISSION_KEYS, type Permission, type Scope } from "@/lib/access/permissions";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTime, istDate, istMidnight, addDays } from "@/lib/time";
import {
  ACCESS_PAGE_SIZE,
  activityLabel,
  isOnline,
  ONLINE_WINDOW_MS,
  signInStatus,
  SIGN_IN_ACTIONS,
  timeAgo,
  TIMELINE_PAGE_SIZE,
  type AccessParams,
  type SignInStatus,
  type SystemKey,
} from "@/lib/validations/access";

/** "04 Nov 2026, 09:45 AM" in IST */
export const istStamp = (d: Date) => `${formatDate(istDate(d))}, ${formatTime(d)}`;

// ---- Roles ------------------------------------------------------------------------

export interface RoleRow {
  id: number;
  name: string;
  description: string;
  scope: Scope;
  permissions: Permission[];
  systemKey: SystemKey | null;
  dailyReports: boolean;
  userCount: number;
  updatedAt: string;
}

export async function listRoles(): Promise<RoleRow[]> {
  const roles = await prisma.accessRole.findMany({ include: { _count: { select: { users: true } } } });
  const order = (k: string | null) => (k === "SUPER_ADMIN" ? 0 : k === "HR" ? 1 : k === "EMPLOYEE" ? 2 : 3);
  return roles
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      scope: r.systemKey === "SUPER_ADMIN" ? ("ALL" as Scope) : r.scope,
      permissions: r.systemKey === "SUPER_ADMIN" ? PERMISSION_KEYS : cleanPermissions(r.permissions),
      systemKey: (r.systemKey as SystemKey | null) ?? null,
      dailyReports: r.dailyReports,
      userCount: r._count.users,
      updatedAt: istStamp(r.updatedAt),
    }))
    .sort((a, b) => order(a.systemKey) - order(b.systemKey) || a.name.localeCompare(b.name));
}

// ---- Users --------------------------------------------------------------------------

const userInclude = {
  accessRole: { select: { id: true, name: true, systemKey: true } },
  employee: { select: { id: true, code: true, fullName: true, photoPath: true, deletedAt: true, department: { select: { name: true } }, designation: { select: { name: true } } } },
} satisfies Prisma.UserInclude;

type UserWithRole = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export interface AccessUserRow {
  id: number;
  name: string;
  photo: string | null;
  employeeId: number | null;
  code: string | null;
  department: string | null;
  designation: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  roleId: number | null;
  roleName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  status: SignInStatus;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  lastLogin: string | null;
  lastLoginAgo: string | null;
  online: boolean;
  lastSeenAgo: string | null;
}

/** Display name: the employee's name, else the account name, username or email. */
export const displayName = (u: { id: number; name: string; username: string | null; email: string | null; employee: { fullName: string } | null }) =>
  u.employee?.fullName || u.name || u.username || u.email || `User #${u.id}`;

function toRow(u: UserWithRole, now: Date, systemIds: Map<string, number>): AccessUserRow {
  const isSuperAdmin = u.role === "SUPER_ADMIN";
  // Accounts not yet moved onto an access role fall back to the built-in role for their legacy role.
  const fallbackId = systemIds.get(u.role) ?? null;
  const emp = u.employee && !u.employee.deletedAt ? u.employee : null;
  return {
    id: u.id,
    name: displayName(u),
    photo: emp?.photoPath ? `/api/files/${emp.photoPath}` : null,
    employeeId: emp?.id ?? null,
    code: emp?.code ?? null,
    department: emp?.department?.name ?? null,
    designation: emp?.designation?.name ?? null,
    username: u.username,
    email: u.email,
    phone: u.phone,
    roleId: u.accessRoleId ?? fallbackId,
    roleName: isSuperAdmin ? "Super Admin" : (u.accessRole?.name ?? (u.role === "HR" ? "HR / Manager" : "Employee")),
    isSuperAdmin,
    isActive: u.isActive,
    status: signInStatus(u, now),
    lockedUntil: u.lockedUntil && u.lockedUntil > now ? istStamp(u.lockedUntil) : null,
    mustChangePassword: u.mustChangePassword,
    lastLogin: u.lastLoginAt ? istStamp(u.lastLoginAt) : null,
    lastLoginAgo: timeAgo(u.lastLoginAt, now),
    online: u.isActive && isOnline(u.lastSeenAt, now),
    // Sign-ins from before presence tracking have no lastSeenAt; the sign-in itself counts as seen.
    lastSeenAgo: timeAgo(u.lastSeenAt ?? u.lastLoginAt, now),
  };
}

async function systemRoleIds(): Promise<Map<string, number>> {
  const roles = await prisma.accessRole.findMany({ where: { systemKey: { not: null } }, select: { id: true, systemKey: true } });
  return new Map(roles.map((r) => [r.systemKey!, r.id]));
}

/**
 * Every sign-in account, filtered in memory (an office has tens of accounts, and status
 * depends on the clock). Counts are per status before the status filter is applied.
 */
export async function listAccessUsers(p: AccessParams) {
  const now = new Date();
  const [users, systemIds] = await Promise.all([prisma.user.findMany({ include: userInclude, orderBy: { id: "asc" } }), systemRoleIds()]);
  let rows = users.map((u) => toRow(u, now, systemIds));

  if (p.q) {
    const q = p.q.toLowerCase();
    const digits = q.replace(/\D/g, "");
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.username?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.code?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        (digits.length >= 3 && r.phone?.includes(digits)),
    );
  }
  if (p.role) rows = rows.filter((r) => r.roleId === p.role);

  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.status === "ACTIVE").length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    locked: rows.filter((r) => r.status === "LOCKED").length,
    disabled: rows.filter((r) => r.status === "DISABLED").length,
    online: rows.filter((r) => r.online).length,
  };
  if (p.status) rows = rows.filter((r) => (p.status === "online" ? r.online : r.status === p.status!.toUpperCase()));

  // Online first, then by name.
  rows.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / ACCESS_PAGE_SIZE));
  const page = Math.min(p.page, pageCount);
  return { rows: rows.slice((page - 1) * ACCESS_PAGE_SIZE, page * ACCESS_PAGE_SIZE), total, page, pageCount, counts };
}

export async function getAccessUser(id: number): Promise<AccessUserRow | null> {
  const [u, systemIds] = await Promise.all([prisma.user.findUnique({ where: { id }, include: userInclude }), systemRoleIds()]);
  return u ? toRow(u, new Date(), systemIds) : null;
}

/** Options for the role pickers. */
export async function roleOptions() {
  const roles = await prisma.accessRole.findMany({ select: { id: true, name: true, systemKey: true, scope: true } });
  const order = (k: string | null) => (k === "SUPER_ADMIN" ? 0 : k === "HR" ? 1 : k === "EMPLOYEE" ? 2 : 3);
  return roles
    .sort((a, b) => order(a.systemKey) - order(b.systemKey) || a.name.localeCompare(b.name))
    .map((r) => ({ id: r.id, name: r.name, isSuperAdmin: r.systemKey === "SUPER_ADMIN" }));
}
export type RoleOption = Awaited<ReturnType<typeof roleOptions>>[number];

// ---- Activity overview --------------------------------------------------------------

const actorSelect = { select: { id: true, name: true, username: true, email: true, employee: { select: { fullName: true, photoPath: true } } } } as const;

type JsonObj = Record<string, unknown>;
const obj = (v: Prisma.JsonValue | null): JsonObj => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObj) : {});

export async function activityOverview() {
  const now = new Date();
  const today = istDate(now);
  const weekAgo = istMidnight(addDays(today, -6));

  const [online, signIns, failed, changes] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_WINDOW_MS) } },
      include: { accessRole: { select: { name: true } }, employee: { select: { fullName: true, photoPath: true } } },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { action: "LOGIN", createdAt: { gte: istMidnight(today) } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { actor: actorSelect },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["LOGIN_FAILED", "LOCKED"] }, createdAt: { gte: weekAgo } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: actorSelect },
    }),
    prisma.auditLog.findMany({
      where: { action: { notIn: [...SIGN_IN_ACTIONS] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      include: { actor: actorSelect },
    }),
  ]);

  const failedTotal = await prisma.auditLog.count({ where: { action: { in: ["LOGIN_FAILED", "LOCKED"] }, createdAt: { gte: weekAgo } } });

  return {
    online: online.map((u) => ({
      id: u.id,
      name: displayName(u),
      photo: u.employee?.photoPath ? `/api/files/${u.employee.photoPath}` : null,
      role: u.role === "SUPER_ADMIN" ? "Super Admin" : (u.accessRole?.name ?? "Employee"),
      seen: timeAgo(u.lastSeenAt, now) ?? "",
    })),
    signIns: signIns.map((l) => ({
      id: l.id,
      userId: l.actor?.id ?? null,
      name: l.actor ? displayName(l.actor) : "Unknown",
      photo: l.actor?.employee?.photoPath ? `/api/files/${l.actor.employee.photoPath}` : null,
      time: formatTime(l.createdAt),
      ip: l.ip,
    })),
    signInPeople: new Set(signIns.map((l) => l.actorId)).size,
    failed: failed.map((l) => {
      const after = obj(l.after);
      const identifier = typeof after.identifier === "string" ? after.identifier : l.actor ? (l.actor.username ?? l.actor.email ?? displayName(l.actor)) : "—";
      const reason = l.action === "LOCKED" ? "locked after too many attempts" : typeof after.reason === "string" ? after.reason : "failed";
      return {
        id: l.id,
        userId: l.actor?.id ?? null,
        name: l.actor ? displayName(l.actor) : null,
        identifier,
        reason,
        attempt: typeof after.attempt === "number" ? after.attempt : null,
        locked: l.action === "LOCKED",
        ip: l.ip,
        when: istStamp(l.createdAt),
      };
    }),
    failedTotal,
    changes: changes.map((l) => ({
      id: l.id,
      actorId: l.actor?.id ?? null,
      actor: l.actor ? displayName(l.actor) : "System",
      action: l.action,
      label: activityLabel(l.action, l.entity, l.entityId),
      entity: l.entity,
      entityId: l.entityId,
      when: istStamp(l.createdAt),
      ago: timeAgo(l.createdAt, now) ?? "",
    })),
  };
}
export type ActivityOverview = Awaited<ReturnType<typeof activityOverview>>;

// ---- Per-user timeline --------------------------------------------------------------

export interface TimelineEntry {
  id: number;
  time: string;
  /** "04 Nov 2026, 09:45 AM" (IST) */
  stamp: string;
  action: string;
  label: string;
  entity: string;
  entityId: string | null;
  /** Who did it, when that wasn't the user themselves (e.g. an admin resetting their password). */
  by: string | null;
  byId: number | null;
  /** True when the entry is about this user's own account */
  onSelf: boolean;
  reason: string | null;
  ip: string | null;
  diff: DiffRow[];
}

/** Everything a user did plus everything done to their account, newest first, grouped by IST day. */
export async function userTimeline(userId: number, requestedPage: number) {
  const where: Prisma.AuditLogWhereInput = { OR: [{ actorId: userId }, { entity: "User", entityId: String(userId) }] };
  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / TIMELINE_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * TIMELINE_PAGE_SIZE,
    take: TIMELINE_PAGE_SIZE,
    include: { actor: actorSelect },
  });

  const days: { day: string; label: string; entries: TimelineEntry[] }[] = [];
  const today = istDate();
  for (const l of logs) {
    const day = istDate(l.createdAt);
    let group = days.at(-1);
    if (!group || group.day !== day) {
      const label = day === today ? `Today · ${formatDate(day)}` : day === addDays(today, -1) ? `Yesterday · ${formatDate(day)}` : formatDate(day);
      group = { day, label, entries: [] };
      days.push(group);
    }
    const byOther = l.actorId !== userId;
    group.entries.push({
      id: l.id,
      time: formatTime(l.createdAt),
      stamp: istStamp(l.createdAt),
      action: l.action,
      label: activityLabel(l.action, l.entity, l.entityId),
      entity: l.entity,
      entityId: l.entityId,
      by: byOther ? (l.actor ? displayName(l.actor) : "System") : null,
      byId: byOther ? (l.actor?.id ?? null) : null,
      onSelf: l.entity === "User" && l.entityId === String(userId),
      reason: l.reason,
      ip: l.ip,
      diff: diffAudit(l.before, l.after),
    });
  }
  return { days, total, page, pageCount };
}
