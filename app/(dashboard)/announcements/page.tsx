import { AnnouncementsView } from "@/components/announcements/announcements-view";
import { currentAnnouncements, pastAnnouncements } from "@/lib/announcements";
import { hasPermission, requireUser } from "@/lib/session";
import { istDate } from "@/lib/time";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const canManage = hasPermission(user, "announcements.manage");
  const showPast = canManage && (await searchParams).past === "1";
  const [current, past] = await Promise.all([currentAnnouncements(), showPast ? pastAnnouncements() : null]);

  return <AnnouncementsView today={istDate()} canManage={canManage} current={current} past={past} />;
}
