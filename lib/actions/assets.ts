"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden, type SessionUser } from "@/lib/session";
import { formatDate, istDate, ymdToDb } from "@/lib/time";
import { assetSchema, assignSchema, CONDITION_LABEL, returnSchema, statusSchema, type AssetInput } from "@/lib/validations/assets";

export type AssetResult = { ok: true; message: string } | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string): AssetResult => ({ ok: false, error, field });
const done = (message: string, employeeId?: number | null): AssetResult => {
  revalidatePath("/assets");
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
  return { ok: true, message };
};

async function guarded(name: string, fn: (actor: SessionUser) => Promise<AssetResult>): Promise<AssetResult> {
  try {
    return await fn(await actionUser("assets.manage"));
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues[0]?.message ?? "Check the details and try again.", String(err.issues[0]?.path[0] ?? ""));
    const e = err as { code?: string };
    if (e?.code === "P2002") return fail("Another asset already has this tag.", "tag");
    console.error(`${name} failed`, err);
    return fail("Something went wrong. Try again.");
  }
}

const event = (tx: Prisma.TransactionClient, actor: SessionUser, assetId: number, action: string, extra: { employeeId?: number | null; condition?: Prisma.AssetEventCreateManyInput["condition"]; note?: string } = {}) =>
  tx.assetEvent.create({ data: { assetId, action, actorId: actor.id, actorName: actor.name, employeeId: extra.employeeId ?? null, condition: extra.condition ?? null, note: extra.note ?? "" } });

export async function saveAsset(id: number | null, input: AssetInput): Promise<AssetResult> {
  return guarded("saveAsset", async (actor) => {
    if (id !== null) z.number().int().positive().parse(id);
    const v = assetSchema.parse(input);
    const data = { ...v, serialNo: v.serialNo || null, purchaseDate: v.purchaseDate ? ymdToDb(v.purchaseDate) : null };
    const before = id ? await prisma.asset.findUnique({ where: { id } }) : null;
    if (id && !before) return fail("This asset no longer exists.");
    await prisma.$transaction(async (tx) => {
      const a = id ? await tx.asset.update({ where: { id }, data }) : await tx.asset.create({ data });
      await event(tx, actor, a.id, id ? "UPDATED" : "CREATED", { condition: v.condition });
      await writeAudit({ actorId: actor.id, action: id ? "UPDATE" : "CREATE", entity: "Asset", entityId: a.id, before: before ? { tag: before.tag, name: before.name, condition: before.condition } : undefined, after: v }, tx);
    });
    return done(id ? "Asset saved" : `${v.tag} added`);
  });
}

/** Hand an asset in store to an employee. */
export async function assignAsset(id: number, input: { employeeId: number; date: string; note?: string }): Promise<AssetResult> {
  return guarded("assignAsset", async (actor) => {
    z.number().int().positive().parse(id);
    const v = assignSchema.parse(input);
    if (v.date > istDate()) return fail("The hand-over date can't be in the future.", "date");
    const [asset, emp] = await Promise.all([
      prisma.asset.findUnique({ where: { id } }),
      prisma.employee.findFirst({ where: { id: v.employeeId, deletedAt: null }, select: { id: true, fullName: true, userId: true } }),
    ]);
    if (!asset) return fail("This asset no longer exists.");
    if (asset.status !== "AVAILABLE") return fail("Only assets in store can be handed over. Take it back first.");
    if (!emp) return fail("Pick a valid employee.", "employeeId");
    await prisma.$transaction(async (tx) => {
      const r = await tx.asset.updateMany({ where: { id, status: "AVAILABLE" }, data: { status: "ASSIGNED", employeeId: emp.id, assignedAt: ymdToDb(v.date) } });
      if (!r.count) throw new Forbidden("Someone else changed this asset a moment ago. Refresh and try again.");
      await event(tx, actor, id, "ASSIGNED", { employeeId: emp.id, condition: asset.condition, note: v.note });
      await writeAudit({ actorId: actor.id, action: "ASSIGN", entity: "Asset", entityId: id, after: { tag: asset.tag, employeeId: emp.id, date: v.date } }, tx);
    });
    if (emp.userId) {
      await notifyUsers([emp.userId], {
        title: `${asset.name} handed over to you`,
        body: `Asset ${asset.tag} (${asset.category}) is now with you from ${formatDate(v.date)}. Look after it and return it when you leave.${v.note ? `\nNote: ${v.note}` : ""}`,
        link: "/assets",
      });
    }
    return done(`${asset.tag} handed to ${emp.fullName}`, emp.id);
  });
}

/** Take an asset back from its holder; it goes to the store, repair or retirement. */
export async function returnAsset(id: number, input: { condition: string; next: string; note?: string }): Promise<AssetResult> {
  return guarded("returnAsset", async (actor) => {
    z.number().int().positive().parse(id);
    const v = returnSchema.parse(input);
    const asset = await prisma.asset.findUnique({ where: { id }, include: { employee: { select: { fullName: true } } } });
    if (!asset || asset.status !== "ASSIGNED") return fail("This asset isn't with anyone.");
    if (v.condition === "DAMAGED" && v.next === "AVAILABLE") return fail("A damaged asset should go for repair or be retired.", "next");
    await prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id }, data: { status: v.next, condition: v.condition, employeeId: null, assignedAt: null } });
      await event(tx, actor, id, "RETURNED", { employeeId: asset.employeeId, condition: v.condition, note: v.note });
      if (v.next !== "AVAILABLE") await event(tx, actor, id, v.next === "REPAIR" ? "REPAIR" : "RETIRED");
      await writeAudit({ actorId: actor.id, action: "RETURN", entity: "Asset", entityId: id, before: { employeeId: asset.employeeId }, after: { status: v.next, condition: v.condition } }, tx);
    });
    return done(`${asset.tag} returned by ${asset.employee?.fullName ?? "the employee"} · ${CONDITION_LABEL[v.condition]}`, asset.employeeId);
  });
}

/** Send for repair, bring back from repair, retire or put back in use (not while with someone). */
export async function setAssetStatus(id: number, input: { status: string; note?: string }): Promise<AssetResult> {
  return guarded("setAssetStatus", async (actor) => {
    z.number().int().positive().parse(id);
    const v = statusSchema.parse(input);
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) return fail("This asset no longer exists.");
    if (asset.status === "ASSIGNED") return fail("Take it back from the employee first.");
    if (asset.status === v.status) return fail("Nothing to change.");
    const action = v.status === "REPAIR" ? "REPAIR" : v.status === "RETIRED" ? "RETIRED" : asset.status === "REPAIR" ? "REPAIRED" : "RESTORED";
    await prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id }, data: { status: v.status, ...(action === "REPAIRED" && { condition: "GOOD" }) } });
      await event(tx, actor, id, action, { note: v.note });
      await writeAudit({ actorId: actor.id, action: "STATUS", entity: "Asset", entityId: id, before: { status: asset.status }, after: { status: v.status }, reason: v.note || null }, tx);
    });
    return done("Asset updated");
  });
}

/** Delete an asset added by mistake (never handed to anyone). */
export async function deleteAsset(id: number): Promise<AssetResult> {
  return guarded("deleteAsset", async (actor) => {
    z.number().int().positive().parse(id);
    const asset = await prisma.asset.findUnique({ where: { id }, include: { events: { where: { action: "ASSIGNED" }, take: 1 } } });
    if (!asset) return fail("This asset no longer exists.");
    if (asset.events.length) return fail("This asset has been handed out before. Retire it instead so its history stays.");
    await prisma.$transaction(async (tx) => {
      await tx.asset.delete({ where: { id } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "Asset", entityId: id, before: { tag: asset.tag, name: asset.name } }, tx);
    });
    return done(`${asset.tag} deleted`);
  });
}
