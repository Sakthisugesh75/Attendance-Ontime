import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, formatDate, formatTime, istDate, istMidnight } from "@/lib/time";
import { AUDIT_PAGE_SIZE, changedCount, diffAudit, type AuditParams, type DiffRow } from "./audit-utils";

/** Prisma filter for the URL filters. Dates are IST calendar days, inclusive. */
export function auditWhere(p: AuditParams): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (p.from || p.to) {
    and.push({ createdAt: { ...(p.from ? { gte: istMidnight(p.from) } : {}), ...(p.to ? { lt: istMidnight(addDays(p.to, 1)) } : {}) } });
  }
  if (p.actor) and.push({ actorId: p.actor === "system" ? null : Number(p.actor) });
  if (p.entity) and.push({ entity: p.entity });
  if (p.action) and.push({ action: p.action });
  if (p.q) {
    const q = p.q;
    and.push({
      OR: [
        { reason: { contains: q } },
        { entityId: { contains: q } },
        { ip: { contains: q } },
        { action: { contains: q } },
        { entity: { contains: q } },
        { actor: { is: { OR: [{ name: { contains: q } }, { email: { contains: q } }, { username: { contains: q } }, { employee: { is: { fullName: { contains: q } } } }] } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

const actorSelect = { select: { id: true, name: true, email: true, username: true, employee: { select: { fullName: true } } } } as const;

type ActorRow = { id: number; name: string; email: string | null; username: string | null; employee: { fullName: string } | null } | null;

export function actorLabel(a: ActorRow): { name: string; sub: string | null } {
  if (!a) return { name: "System", sub: null };
  const name = a.employee?.fullName || a.name || a.username || a.email || `User #${a.id}`;
  const sub = a.email && a.email !== name ? a.email : a.username && a.username !== name ? `@${a.username}` : null;
  return { name, sub };
}

/** "04 Nov 2026, 09:45 AM" in IST */
export const auditTime = (d: Date) => `${formatDate(istDate(d))}, ${formatTime(d)}`;

/** Where an entity's id can be opened in the app, if anywhere. */
export function entityHref(entity: string, id: string | null): string | null {
  if (!id || !/^\d+$/.test(id)) return null;
  if (entity === "Employee") return `/employees/${id}`;
  if (entity === "ImportBatch") return `/import/${id}`;
  if (entity === "User") return `/access/users/${id}`;
  return null;
}

export interface AuditRow {
  id: number;
  when: string;
  actor: string;
  actorSub: string | null;
  system: boolean;
  action: string;
  entity: string;
  entityId: string | null;
  href: string | null;
  reason: string | null;
  ip: string | null;
  diff: DiffRow[];
  changed: number;
}

export async function listAudit(p: AuditParams) {
  const where = auditWhere(p);
  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(p.page, pageCount);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
    include: { actor: actorSelect },
  });
  const rows: AuditRow[] = logs.map((l) => {
    const actor = actorLabel(l.actor);
    const diff = diffAudit(l.before, l.after);
    return {
      id: l.id,
      when: auditTime(l.createdAt),
      actor: actor.name,
      actorSub: actor.sub,
      system: !l.actor,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      href: entityHref(l.entity, l.entityId),
      reason: l.reason,
      ip: l.ip,
      diff,
      changed: changedCount(diff),
    };
  });
  return { rows, total, page, pageCount };
}

/** Choices for the filter selects: only values that occur in the log. */
export async function auditFilterOptions() {
  const [actions, entities, actorIds] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["actorId"], select: { actorId: true } }),
  ]);
  const ids = actorIds.map((a) => a.actorId).filter((x): x is number => x !== null);
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, ...actorSelect }) : [];
  return {
    actions: actions.map((a) => a.action),
    entities: entities.map((e) => e.entity),
    actors: users.map((u) => ({ id: String(u.id), label: actorLabel(u).name })).sort((a, b) => a.label.localeCompare(b.label)),
    hasSystem: actorIds.some((a) => a.actorId === null),
  };
}

/** Rows for the CSV export (newest first, capped). */
export async function exportAudit(p: AuditParams, limit = 20_000) {
  const logs = await prisma.auditLog.findMany({
    where: auditWhere(p),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: { actor: actorSelect },
  });
  return logs.map((l) => {
    const a = actorLabel(l.actor);
    return [l.id, auditTime(l.createdAt), a.name, l.actor?.email ?? "", l.action, l.entity, l.entityId ?? "", l.reason ?? "", l.ip ?? "", l.before ?? "", l.after ?? ""];
  });
}

export const AUDIT_CSV_HEADER = ["ID", "Time (IST)", "Actor", "Actor email", "Action", "Entity", "Entity ID", "Reason", "IP", "Before (JSON)", "After (JSON)"];
