import type { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export interface AuditEntry {
  actorId: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}

/** Best-effort client IP of the current request (null outside a request). */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    return null;
  }
}

/** Appends one audit row. Pass a transaction client to keep it atomic with the change. */
export async function writeAudit(entry: AuditEntry, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      before: toJson(entry.before),
      after: toJson(entry.after),
      reason: entry.reason ?? null,
      ip: entry.ip === undefined ? await requestIp() : entry.ip,
    },
  });
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  return v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
}
