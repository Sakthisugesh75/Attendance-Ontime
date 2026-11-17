"use client";

import { CalendarClock, History, Loader2, Megaphone, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { ConfirmButton } from "@/components/settings/confirm-button";
import { Button } from "@/components/ui/button";
import { deleteAnnouncement, setAnnouncementPinned } from "@/lib/actions/announcements";
import type { AnnouncementItem } from "@/lib/announcements";
import { formatDate, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AnnouncementBody, isFresh, postedLabel, untilLabel } from "./announcement-meta";
import { AnnouncementSheet } from "./announcement-sheet";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function AnnouncementsView({ today, canManage, current, past }: { today: string; canManage: boolean; current: AnnouncementItem[]; past: AnnouncementItem[] | null }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementItem | null>(null);
  const openSheet = (a: AnnouncementItem | null) => {
    setEditing(a);
    setOpen(true);
  };

  const pinned = current.filter((a) => a.pinned);
  const latest = current.filter((a) => !a.pinned);
  const fresh = current.filter((a) => isFresh(a.createdAt, today)).length;
  const manage = canManage ? openSheet : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Notice board · ${current.length} current`}
        title="Announcements"
        description={
          current.length
            ? `News and notices from the company${fresh ? `. ${fresh} posted in the last few days` : ""}.`
            : "News and notices from the company show up here and on everyone's dashboard."
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" asChild aria-pressed={!!past}>
                <Link href={past ? "/announcements" : "/announcements?past=1"} scroll={false}>
                  <History /> {past ? "Hide past" : "Show past"}
                </Link>
              </Button>
              <Button onClick={() => openSheet(null)}>
                <Plus /> Post announcement
              </Button>
            </>
          )
        }
      />

      {pinned.length > 0 && (
        <section aria-label="Pinned" className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-title-3 text-ink">
            <Pin aria-hidden className="size-4 text-ink-3" /> Pinned
          </h3>
          <div className={cn("grid gap-3", pinned.length > 1 && "md:grid-cols-2")}>
            {pinned.map((a, i) => (
              <PinnedCard key={a.id} item={a} today={today} index={i} onEdit={manage} />
            ))}
          </div>
        </section>
      )}

      {latest.length > 0 && (
        <section aria-label="Latest" className="space-y-3">
          {pinned.length > 0 && <h3 className="text-title-3 text-ink">Latest</h3>}
          <ol className="space-y-3">
            {latest.map((a, i) => (
              <li key={a.id}>
                <NoticeCard item={a} today={today} index={i + pinned.length} onEdit={manage} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {current.length === 0 && (
        <Panel>
          <EmptyState
            icon={Megaphone}
            art="bell"
            title="No announcements right now"
            action={
              canManage ? (
                <Button onClick={() => openSheet(null)}>
                  <Plus /> Post the first one
                </Button>
              ) : undefined
            }
          >
            {canManage ? "Share holiday plans, policy changes, events or anything everyone should know." : "When HR posts news or a notice, you'll see it here and on your dashboard."}
          </EmptyState>
        </Panel>
      )}

      {past && (
        <Panel title="Past announcements" description="No longer shown to anyone. Edit one and change its end date to bring it back." actions={<span className="rounded-full bg-sunken px-2 text-caption text-ink-2 tabular-nums">{past.length}</span>}>
          {past.length ? (
            <ul className="divide-y divide-line">
              {past.map((a) => (
                <li key={a.id} className="group flex items-start gap-3.5 px-5 py-4 sm:px-6" data-testid="announcement-past">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{a.title}</p>
                    <p className="mt-0.5 text-caption text-ink-3 tabular-nums">
                      {a.author.name} · posted {postedLabel(a.createdAt, today)} · ended {formatDate(a.expiresOn)}
                    </p>
                    <AnnouncementBody body={a.body} className="mt-2 line-clamp-2 text-ink-2" />
                  </div>
                  <ManageButtons item={a} onEdit={openSheet} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-10 text-center text-body text-ink-2">Nothing has ended yet.</p>
          )}
        </Panel>
      )}

      {canManage && <AnnouncementSheet open={open} onOpenChange={setOpen} announcement={editing} />}
    </div>
  );
}

function Byline({ item, today }: { item: AnnouncementItem; today: string }) {
  const until = untilLabel(item.expiresOn, today);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-3">
      <EmployeeAvatar name={item.author.name} photo={item.author.photo} className="size-6" />
      <span className="font-medium text-ink-2">{item.author.name}</span>
      <span aria-hidden>·</span>
      <time dateTime={item.createdAt} className="tabular-nums">
        {postedLabel(item.createdAt, today)}
      </time>
      {item.edited && <span>(edited)</span>}
      {until && (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span aria-hidden>·</span>
          <CalendarClock aria-hidden className="size-3.5" /> {until}
        </span>
      )}
    </div>
  );
}

function PinnedCard({ item, today, index, onEdit }: { item: AnnouncementItem; today: string; index: number; onEdit: ((a: AnnouncementItem) => void) | null }) {
  return (
    <article
      data-testid="announcement"
      className="rise group flex flex-col rounded-lg border border-line-strong bg-surface p-4 sm:p-5"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-sunken pr-2 pl-1.5 text-caption font-semibold text-ink-2">
          <Pin aria-hidden className="size-3.5" /> Pinned
        </span>
        {onEdit && <ManageButtons item={item} onEdit={onEdit} />}
      </div>
      <h3 className="mt-3 text-title-2 text-ink [overflow-wrap:anywhere]">{item.title}</h3>
      <AnnouncementBody body={item.body} className="mt-2 flex-1 text-ink-2" />
      <div className="mt-4 border-t border-line pt-3">
        <Byline item={item} today={today} />
      </div>
    </article>
  );
}

function NoticeCard({ item, today, index, onEdit }: { item: AnnouncementItem; today: string; index: number; onEdit: ((a: AnnouncementItem) => void) | null }) {
  const day = istDate(new Date(item.createdAt));
  const fresh = isFresh(item.createdAt, today);
  return (
    <article data-testid="announcement" className="rise group flex gap-4 rounded-xl bg-surface shadow-card p-4 sm:p-5" style={{ "--i": index } as React.CSSProperties}>
      <span aria-hidden className="hidden w-12 shrink-0 place-items-center self-start rounded-md border border-line bg-surface py-1.5 sm:grid">
        <span className="text-title-2 text-ink tabular-nums">{day.slice(8)}</span>
        <span className="text-caption text-ink-3">{MONTH_SHORT[Number(day.slice(5, 7)) - 1]}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-title-3 text-ink [overflow-wrap:anywhere]">
            {item.title}
            {fresh && <span className="ml-2 inline-flex h-5 -translate-y-px items-center rounded-full bg-sunken px-2 align-middle text-caption font-semibold text-ink-2">New</span>}
          </h3>
          {onEdit && <ManageButtons item={item} onEdit={onEdit} />}
        </div>
        <AnnouncementBody body={item.body} className="mt-1.5 text-ink-2" />
        <div className="mt-4">
          <Byline item={item} today={today} />
        </div>
      </div>
    </article>
  );
}

/** Pin / edit / delete. Always visible on touch screens; revealed on hover/focus with a mouse. */
function ManageButtons({ item, onEdit }: { item: AnnouncementItem; onEdit: (a: AnnouncementItem) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const togglePin = () =>
    start(async () => {
      const res = await setAnnouncementPinned(item.id, !item.pinned);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <span className="-mt-1.5 -mr-1.5 flex shrink-0 items-center transition-opacity duration-[120ms] pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
      <Button variant="ghost" size="icon" className="max-md:size-11" aria-label={item.pinned ? `Unpin ${item.title}` : `Pin ${item.title}`} title={item.pinned ? "Unpin" : "Pin to the top"} onClick={togglePin} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : item.pinned ? <PinOff /> : <Pin />}
      </Button>
      <Button variant="ghost" size="icon" className="max-md:size-11" aria-label={`Edit ${item.title}`} title="Edit" onClick={() => onEdit(item)}>
        <Pencil />
      </Button>
      <ConfirmButton
        variant="ghost"
        size="icon"
        aria-label={`Delete ${item.title}`}
        title="Delete this announcement?"
        description={`“${item.title}” is removed for everyone. Notifications already sent stay in people's bells.`}
        confirmLabel="Delete"
        action={() => deleteAnnouncement(item.id)}
        onDone={() => router.refresh()}
      >
        <Trash2 />
      </ConfirmButton>
    </span>
  );
}
