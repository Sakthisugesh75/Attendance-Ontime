import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dbToYmd, istDate, ymdToDb } from "@/lib/time";

/** One announcement as the pages and the dashboard card show it. */
export interface AnnouncementItem {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  /** Last day shown ("" = until removed) */
  expiresOn: string;
  /** Posted at (ISO instant) */
  createdAt: string;
  /** Edited after posting (more than a minute later) */
  edited: boolean;
  author: { name: string; photo: string | null };
}

const include = {
  createdBy: { select: { name: true, email: true, employee: { select: { fullName: true, photoPath: true } } } },
} satisfies Prisma.AnnouncementInclude;

type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;

const toItem = (a: Row): AnnouncementItem => ({
  id: a.id,
  title: a.title,
  body: a.body,
  pinned: a.pinned,
  expiresOn: a.expiresOn ? dbToYmd(a.expiresOn) : "",
  createdAt: a.createdAt.toISOString(),
  edited: a.updatedAt.getTime() - a.createdAt.getTime() > 60_000,
  author: {
    name: a.createdBy.employee?.fullName || a.createdBy.name || a.createdBy.email || "Admin",
    photo: a.createdBy.employee?.photoPath ? `/api/files/${a.createdBy.employee.photoPath}` : null,
  },
});

/** Still shown on `today`: no end date, or the end date hasn't passed. */
const currentWhere = (today: string): Prisma.AnnouncementWhereInput => ({ OR: [{ expiresOn: null }, { expiresOn: { gte: ymdToDb(today) } }] });

/** Current announcements, pinned first, then newest. */
export async function currentAnnouncements(take?: number): Promise<AnnouncementItem[]> {
  const rows = await prisma.announcement.findMany({
    where: currentWhere(istDate()),
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take,
    include,
  });
  return rows.map(toItem);
}

/** Announcements whose "show until" day has passed, most recently ended first. */
export async function pastAnnouncements(take = 50): Promise<AnnouncementItem[]> {
  const rows = await prisma.announcement.findMany({
    where: { expiresOn: { lt: ymdToDb(istDate()) } },
    orderBy: [{ expiresOn: "desc" }, { createdAt: "desc" }],
    take,
    include,
  });
  return rows.map(toItem);
}
