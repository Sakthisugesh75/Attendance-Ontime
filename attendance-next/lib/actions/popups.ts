"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { monthView } from "@/lib/attendance/service";
import { prisma } from "@/lib/prisma";
import { actionUser } from "@/lib/session";
import { formatTime, istDate, istMinutes, ymdToDb } from "@/lib/time";

export interface PopupNotice {
  id: number;
  title: string;
  body: string;
  link: string | null;
  /** "06:42 PM" */
  when: string;
}

export interface PendingPopups {
  notices: PopupNotice[];
  /** Built-in daily-report nudge: punched in today, day is over (punched out or shift ended), no report yet */
  report: { date: string; punchedOut: boolean } | null;
}

/** What should pop up for the signed-in user right now. Polled by the reminder pop-up. */
export async function pendingPopups(): Promise<PendingPopups> {
  const user = await actionUser();
  const now = new Date();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, popup: true, readAt: null, OR: [{ popupAfter: null }, { popupAfter: { lte: now } }] },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  const notices = rows.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, when: formatTime(n.createdAt) }));

  let report: PendingPopups["report"] = null;
  if (user.employeeId && user.writesReports) {
    const today = istDate(now);
    const sent = await prisma.dailyReport.findUnique({ where: { employeeId_date: { employeeId: user.employeeId, date: ymdToDb(today) } }, select: { id: true } });
    if (!sent) {
      const [day] = await monthView(user.employeeId, [today]);
      const punchedIn = !!day?.record?.punchInAt;
      const punchedOut = !!day?.record?.punchOutAt;
      const shiftOver = !!day?.timing && istMinutes(now, today) >= day.timing.end;
      if (punchedIn && (punchedOut || shiftOver)) report = { date: today, punchedOut };
    }
  }
  return { notices, report };
}

const idSchema = z.number().int().positive();

/** Opened from the pop-up: counts as read, so it won't pop up again. */
export async function openPopup(id: number) {
  const user = await actionUser();
  await prisma.notification.updateMany({ where: { id: idSchema.parse(id), userId: user.id }, data: { readAt: new Date(), popup: false } });
  revalidatePath("/", "layout");
}

/** "Remind me later" (minutes) or "Dismiss" (no minutes): it stays unread in the bell. */
export async function dismissPopup(id: number, snoozeMinutes?: number) {
  const user = await actionUser();
  const minutes = snoozeMinutes === undefined ? null : z.number().int().min(5).max(240).parse(snoozeMinutes);
  await prisma.notification.updateMany({
    where: { id: idSchema.parse(id), userId: user.id },
    data: minutes ? { popupAfter: new Date(Date.now() + minutes * 60_000) } : { popup: false },
  });
}
