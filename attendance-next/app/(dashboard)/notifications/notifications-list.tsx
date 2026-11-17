"use client";

import { CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  when: string;
}

export interface NotificationGroup {
  label: string;
  items: NotificationItem[];
}

export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await markAllNotificationsRead();
            toast.success("All notifications marked as read");
          } catch {
            toast.error("Couldn't update notifications. Try again.");
          }
        })
      }
    >
      <CheckCheck /> Mark all read
    </Button>
  );
}

export function NotificationsList({ groups }: { groups: NotificationGroup[] }) {
  const [, start] = useTransition();
  const [list, markRead] = useOptimistic(groups, (state, id: number) => state.map((g) => ({ ...g, items: g.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })));
  const read = (n: NotificationItem) => {
    if (n.read) return;
    start(async () => {
      markRead(n.id);
      await markNotificationRead(n.id);
    });
  };

  return (
    <div>
      {list.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="border-b border-line bg-sunken px-5 py-2 text-col-header text-ink-3 tabular-nums sm:px-6">{g.label}</h3>
          <ul className="divide-y divide-line">
            {g.items.map((n) => {
              const inner = (
                <>
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-body", n.read ? "text-ink-2" : "font-semibold text-ink")}>
                      {!n.read && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-body break-words text-ink-2">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-caption text-ink-3 tabular-nums">{n.when}</span>
                </>
              );
              const cls = cn(
                "flex min-h-14 w-full items-start gap-3 px-5 py-3.5 text-left transition-colors duration-[120ms] outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:px-6",
                !n.read && "bg-brand-subtle/40",
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => read(n)} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => read(n)} className={cls}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function NotificationsPager({ page, pageCount, total, pageSize }: { page: number; pageCount: number; total: number; pageSize: number }) {
  const href = (p: number) => (p <= 1 ? "/notifications" : `/notifications?page=${p}`);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-body sm:px-6">
      <span className="text-ink-3 tabular-nums">
        <span>
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
        </span>{" "}
        of <span>{total}</span>
      </span>
      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
          <ChevronLeft />
        </PageLink>
        <span className="px-2 text-ink-3 tabular-nums">
          {page} / {pageCount}
        </span>
        <PageLink href={href(page + 1)} disabled={page >= pageCount} label="Next page">
          <ChevronRight />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled)
    return (
      <Button variant="outline" size="icon" disabled aria-label={label} className="max-md:size-11">
        {children}
      </Button>
    );
  return (
    <Button asChild variant="outline" size="icon" className="max-md:size-11">
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
