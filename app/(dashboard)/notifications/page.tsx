import { BellOff } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { addDays, formatDate, formatTime, istDate } from "@/lib/time";
import { MarkAllReadButton, NotificationsList, NotificationsPager, type NotificationGroup } from "./notifications-list";

export const metadata = { title: "Notifications" };

const PAGE_SIZE = 25;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const requested = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? "1", 10) || 1));

  const [total, unread] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pageCount);
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Group by IST day: "Today", "Yesterday", "02 Nov 2026"
  const today = istDate();
  const yesterday = addDays(today, -1);
  const groups: NotificationGroup[] = [];
  for (const n of rows) {
    const day = istDate(n.createdAt);
    const label = day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(day);
    let g = groups.at(-1);
    if (!g || g.label !== label) groups.push((g = { label, items: [] }));
    g.items.push({ id: n.id, title: n.title, body: n.body, link: n.link, read: n.readAt !== null, when: formatTime(n.createdAt) });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={total ? `${total} in total · ${unread ? `${unread} unread` : "all read"}` : "Approvals, reminders and daily summaries land here."}
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />
      <Panel bodyClassName="p-0">
        {total === 0 ? (
          <EmptyState icon={BellOff} art="bell" title="No notifications yet">
            You&apos;ll see request updates, missing punch-out reminders and daily summaries here.
          </EmptyState>
        ) : (
          <>
            <NotificationsList groups={groups} />
            {pageCount > 1 && <NotificationsPager page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} />}
          </>
        )}
      </Panel>
    </div>
  );
}
