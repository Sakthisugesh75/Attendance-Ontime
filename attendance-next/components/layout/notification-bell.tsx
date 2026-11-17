"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

export interface BellItem {
  id: number;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  /** Pre-formatted on the server ("04 Nov, 09:45 AM") */
  when: string;
}

export function NotificationBell({ items }: { items: BellItem[] }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const [list, apply] = useOptimistic(items, (state, id: number | "all") => state.map((n) => (id === "all" || n.id === id ? { ...n, read: true } : n)));
  const unread = list.filter((n) => !n.read).length;

  const read = (id: number | "all") =>
    start(async () => {
      apply(id);
      await (id === "all" ? markAllNotificationsRead() : markNotificationRead(id));
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell />
          {unread > 0 && (
            <span aria-hidden className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-on-brand tabular-nums ring-2 ring-surface">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border-line bg-raised p-0 shadow-md">
        <div className="flex min-h-12 items-center justify-between gap-2 border-b border-line px-4 py-2">
          <p className="text-title-3 text-ink">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => read("all")}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-ink-2">You&apos;re all caught up.</p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y divide-line">
              {list.map((n) => {
                const body = (
                  <>
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} />
                    <span className="min-w-0">
                      <span className={cn("block text-body", n.read ? "text-ink-2" : "font-semibold text-ink")}>
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-caption font-normal text-ink-2">{n.body}</span>
                      <span className="mt-1 block text-caption text-ink-3 tabular-nums">{n.when}</span>
                    </span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => {
                          if (!n.read) read(n.id);
                          setOpen(false);
                        }}
                        className="flex gap-3 px-4 py-3 outline-none hover:bg-sunken focus-visible:bg-sunken"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => !n.read && read(n.id)} className="flex w-full gap-3 px-4 py-3 text-left outline-none hover:bg-sunken focus-visible:bg-sunken">
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
        <div className="border-t border-line p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full text-brand-ink hover:text-brand-ink">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
