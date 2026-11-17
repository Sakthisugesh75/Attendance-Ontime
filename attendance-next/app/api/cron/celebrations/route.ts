import { NextResponse, type NextRequest } from "next/server";
import { celebrationMessage, loadCelebrations } from "@/lib/celebrations";
import { verifyCron } from "@/lib/cron";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { istDate, istMidnight } from "@/lib/time";

/**
 * Morning nudge (schedule once a day, e.g. 9:00 AM IST): today's birthdays and work
 * anniversaries go to every active user as one bell notification + email, e.g.
 * "Today: Priya's birthday 🎂". Nothing is sent on days without celebrations, and a second run
 * on the same IST day sends nothing again.
 */
export async function GET(req: NextRequest) {
  const denied = verifyCron(req);
  if (denied) return denied;

  const today = istDate();
  const celebrations = await loadCelebrations(0, today);
  const message = celebrationMessage(celebrations);
  const summary = celebrations.map((c) => ({ kind: c.kind, employeeId: c.person.id, name: c.person.name, years: c.years }));
  if (!message) return NextResponse.json({ date: today, celebrations: summary, notified: 0 });

  const already = await prisma.notification.findFirst({ where: { title: message.title.slice(0, 200), createdAt: { gte: istMidnight(today) } }, select: { id: true } });
  if (already) return NextResponse.json({ date: today, celebrations: summary, notified: 0, skipped: "Already sent today" });

  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  await notifyUsers(
    users.map((u) => u.id),
    { ...message, link: "/dashboard" },
  );
  return NextResponse.json({ date: today, celebrations: summary, notified: users.length });
}

export const POST = GET;
