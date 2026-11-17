import "server-only";
import { permissionHolders, recipientsForMany } from "@/lib/access/recipients";
import { renderEmail } from "@/lib/email-template";
import { sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { formatDate } from "@/lib/time";

/**
 * Notification service. Every message goes to the in-app bell and, when the user has an
 * email, by branded HTML email (with a plain-text part). Add channels (e.g. WhatsApp) by
 * extending `deliver`.
 */
export interface Message {
  title: string;
  body: string;
  link?: string;
  /** Also show it as a pop-up in the app (reminders) */
  popup?: boolean;
}

export async function notifyUsers(userIds: number[], message: Message) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  // Column limits: never let a long list of names fail the insert.
  const row = { title: message.title.slice(0, 200), body: message.body.slice(0, 1000), link: message.link?.slice(0, 255), popup: !!message.popup };
  await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, ...row })) });
  const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true, email: { not: null } }, select: { email: true } });
  if (!users.length) return;
  const company = (await getSetting("company")).name;
  await Promise.allSettled(users.map((u) => deliver(u.email!, message, company)));
}

async function deliver(email: string, message: Message, company: string) {
  const url = message.link ? new URL(message.link, process.env.APP_URL ?? "http://localhost:6001").toString() : null;
  const { html, text } = renderEmail({ company, title: message.title, body: message.body, url });
  await sendMail({ to: email, subject: message.title, text, html });
}

/**
 * Active users who can view everyone's attendance (scope "everyone").
 * @deprecated Kept for compatibility: pick recipients per employee with
 * `recipientsFor` / `recipientsForMany` from lib/access/recipients instead.
 */
export async function hrUserIds(): Promise<number[]> {
  return (await permissionHolders("attendance.view")).filter((h) => h.reach === null).map((h) => h.userId);
}

/**
 * Tells each employee with an open punch, and every user who can view attendance once,
 * listing only the people in their reach.
 */
export async function notifyMissingPunchOut(ymd: string, employeeIds: number[]) {
  if (!employeeIds.length) return;
  const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, fullName: true, userId: true } });
  const when = formatDate(ymd);
  for (const e of employees) {
    if (e.userId) {
      await notifyUsers([e.userId], {
        title: `Missing punch-out on ${when}`,
        body: "You punched in but didn't punch out. Raise a regularization request so HR can fix the day.",
        link: "/attendance",
      });
    }
  }
  const names = new Map(employees.map((e) => [e.id, e.fullName]));
  for (const [userId, ids] of await recipientsForMany("attendance.view", [...names.keys()])) {
    await notifyUsers([userId], {
      title: `${ids.length} missing punch-out${ids.length > 1 ? "s" : ""} on ${when}`,
      body: nameList(ids.map((id) => names.get(id)!)),
      link: "/attendance",
    });
  }
}

/** "Anitha Raman, Karthik S and 3 others" within `max` characters. */
export function nameList(names: string[], max = 900): string {
  const out: string[] = [];
  let len = 0;
  for (const [i, n] of names.entries()) {
    const rest = names.length - i - 1;
    const suffix = rest ? ` and ${rest} other${rest > 1 ? "s" : ""}` : "";
    if (len + n.length + 2 + suffix.length > max && out.length) return `${out.join(", ")} and ${names.length - out.length} other${names.length - out.length > 1 ? "s" : ""}`;
    out.push(n);
    len += n.length + 2;
  }
  return out.join(", ");
}
