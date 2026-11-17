import { ArrowRight, Megaphone, Pin } from "lucide-react";
import Link from "next/link";
import { AnnouncementBody, isFresh, postedLabel } from "@/components/announcements/announcement-meta";
import { Panel } from "@/components/layout/page-header";
import { currentAnnouncements } from "@/lib/announcements";
import { istDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Dashboard card: the latest three current announcements (pinned first, highlighted) and a
 * link to the notice board. Self-contained server component: render `<AnnouncementsCard />`.
 */
export async function AnnouncementsCard({ take = 3 }: { take?: number }) {
  const today = istDate();
  const items = await currentAnnouncements(take);

  return (
    <Panel
      title="Announcements"
      description={items.length ? "From the notice board" : undefined}
      actions={
        <span className="grid size-8 place-items-center rounded-md bg-sunken text-ink-2" aria-hidden>
          <Megaphone className="size-4" />
        </span>
      }
      bodyClassName="p-0"
    >
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 sm:px-6">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken">
            <Megaphone className="size-5 text-ink-3" />
          </span>
          <p className="text-body text-ink-2">No announcements right now. Company news and notices will show up here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                href="/announcements"
                className={cn(
                  "group block px-4 py-3.5 outline-none transition-colors duration-[120ms] hover:bg-sunken focus-visible:shadow-[inset_0_0_0_2px_var(--ad-brand)] sm:px-6",
                  a.pinned && "bg-sunken/60",
                )}
              >
                <div className="flex items-center gap-2">
                  {a.pinned && (
                    <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 text-caption text-ink-2">
                      <Pin aria-hidden className="size-3" /> Pinned
                    </span>
                  )}
                  {!a.pinned && isFresh(a.createdAt, today) && (
                    <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-brand-subtle px-2 text-caption text-brand-ink">New</span>
                  )}
                  <span className="ml-auto shrink-0 text-caption text-ink-3 tabular-nums">{postedLabel(a.createdAt, today)}</span>
                </div>
                <p className="mt-1.5 truncate text-m-meta font-semibold text-ink sm:text-body sm:font-semibold">{a.title}</p>
                <AnnouncementBody body={a.body} className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-ink-2" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/announcements"
        className="flex min-h-12 items-center justify-between border-t border-line px-4 py-3 text-body font-medium text-brand-ink outline-none transition-colors duration-[120ms] hover:bg-sunken focus-visible:shadow-[inset_0_0_0_2px_var(--ad-brand)] sm:px-6"
      >
        All announcements
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </Panel>
  );
}
