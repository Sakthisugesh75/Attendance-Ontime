"use server";

import type { Announcement } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden } from "@/lib/session";
import { dbToYmd, ymdToDb } from "@/lib/time";
import { announcementSchema, announcementSchemaFor, type AnnouncementInput, type AnnouncementValues } from "@/lib/validations/announcements";

export type AnnouncementResult = { ok: true; message: string } | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string): AnnouncementResult => ({ ok: false, error, field });

const snapshot = (a: Announcement) => ({ title: a.title, body: a.body, pinned: a.pinned, expiresOn: a.expiresOn ? dbToYmd(a.expiresOn) : null });

const data = (v: AnnouncementValues) => ({ title: v.title, body: v.body, pinned: v.pinned, expiresOn: v.expiresOn ? ymdToDb(v.expiresOn) : null });

function revalidate() {
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
}

async function guarded(name: string, run: () => Promise<AnnouncementResult>): Promise<AnnouncementResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    console.error(`${name} failed`, err);
    return fail("Could not save the announcement. Try again.");
  }
}

/** Bell notification (and email) to every active sign-in except the author. Returns how many. */
async function notifyEveryone(authorId: number, a: Announcement, updated: boolean): Promise<number> {
  const users = await prisma.user.findMany({ where: { isActive: true, id: { not: authorId } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const preview = a.body.length > 280 ? `${a.body.slice(0, 277).trimEnd()}…` : a.body;
  // Pops up for everyone the next time they open the app (and stays in the bell).
  await notifyUsers(ids, { title: `${updated ? "Updated: " : "📣 "}${a.title}`, body: preview, link: "/announcements", popup: true });
  return ids.length;
}

const notified = (n: number) => (n ? ` · ${n} ${n === 1 ? "person" : "people"} notified` : "");

export async function createAnnouncement(input: AnnouncementInput): Promise<AnnouncementResult> {
  return guarded("createAnnouncement", async () => {
    const actor = await actionUser("announcements.manage");
    const parsed = announcementSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;

    const created = await prisma.$transaction(async (tx) => {
      const a = await tx.announcement.create({ data: { ...data(v), createdById: actor.id } });
      await writeAudit({ actorId: actor.id, action: "CREATE", entity: "Announcement", entityId: a.id, after: { ...snapshot(a), notify: v.notify } }, tx);
      return a;
    });
    const n = v.notify ? await notifyEveryone(actor.id, created, false) : 0;
    revalidate();
    return { ok: true, message: `Announcement posted${notified(n)}` };
  });
}

export async function updateAnnouncement(id: number, input: AnnouncementInput): Promise<AnnouncementResult> {
  return guarded("updateAnnouncement", async () => {
    const actor = await actionUser("announcements.manage");
    z.number().int().positive().parse(id);
    const before = await prisma.announcement.findUnique({ where: { id } });
    if (!before) return fail("This announcement no longer exists.");
    // An unchanged end date that has already passed may be kept while editing other fields.
    const parsed = announcementSchemaFor(before.expiresOn ? dbToYmd(before.expiresOn) : "").safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;

    const after = await prisma.$transaction(async (tx) => {
      const a = await tx.announcement.update({ where: { id }, data: data(v) });
      await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "Announcement", entityId: id, before: snapshot(before), after: { ...snapshot(a), notify: v.notify } }, tx);
      return a;
    });
    const n = v.notify ? await notifyEveryone(actor.id, after, true) : 0;
    revalidate();
    return { ok: true, message: `Announcement saved${notified(n)}` };
  });
}

export async function setAnnouncementPinned(id: number, pinned: boolean): Promise<AnnouncementResult> {
  return guarded("setAnnouncementPinned", async () => {
    const actor = await actionUser("announcements.manage");
    z.number().int().positive().parse(id);
    z.boolean().parse(pinned);
    const before = await prisma.announcement.findUnique({ where: { id } });
    if (!before) return fail("This announcement no longer exists.");
    await prisma.$transaction(async (tx) => {
      await tx.announcement.update({ where: { id }, data: { pinned } });
      await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "Announcement", entityId: id, before: { pinned: before.pinned }, after: { pinned } }, tx);
    });
    revalidate();
    return { ok: true, message: pinned ? "Pinned to the top" : "Unpinned" };
  });
}

export async function deleteAnnouncement(id: number): Promise<AnnouncementResult> {
  return guarded("deleteAnnouncement", async () => {
    const actor = await actionUser("announcements.manage");
    z.number().int().positive().parse(id);
    const before = await prisma.announcement.findUnique({ where: { id } });
    if (!before) return fail("This announcement no longer exists.");
    await prisma.$transaction(async (tx) => {
      await tx.announcement.delete({ where: { id } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "Announcement", entityId: id, before: snapshot(before) }, tx);
    });
    revalidate();
    return { ok: true, message: "Announcement removed" };
  });
}
