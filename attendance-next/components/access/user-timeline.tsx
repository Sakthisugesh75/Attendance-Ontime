"use client";

import { ChevronLeft, ChevronRight, History, KeyRound, LogIn, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuditDiff } from "@/components/audit/audit-diff";
import { ActionBadge } from "@/components/audit/audit-log-view";
import { EmptyState } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import type { TimelineEntry } from "@/lib/access/queries";
import * as T from "@/components/reports/table-styles";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof LogIn> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  LOGIN_FAILED: ShieldAlert,
  LOCKED: ShieldAlert,
  USER_ROLE: ShieldCheck,
  PASSWORD_RESET_BY_ADMIN: KeyRound,
  SIGN_OUT_EVERYWHERE: LogOut,
};

function Entry({ e }: { e: TimelineEntry }) {
  const [open, setOpen] = useState(false);
  const Icon = ICON[e.action] ?? History;
  const danger = e.action === "LOGIN_FAILED" || e.action === "LOCKED";
  const expandable = e.diff.length > 0 || !!e.reason;
  return (
    <li className="relative pl-9">
      <span className={cn("absolute top-0.5 left-0 grid size-6 place-items-center rounded-full border border-line bg-surface text-ink-3", danger && "border-transparent bg-danger-subtle text-danger")}>
        <Icon aria-hidden className="size-3.5" />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <time className="text-caption text-ink-3 tabular-nums" title={e.stamp}>
          {e.time}
        </time>
        <span className="text-body font-medium text-ink">{e.label}</span>
        <ActionBadge action={e.action} />
      </div>
      <p className="mt-0.5 text-caption text-ink-3">
        {e.by && (
          <>
            by{" "}
            {e.byId ? (
              <Link href={`/access/users/${e.byId}`} className="text-brand-ink underline-offset-4 hover:underline">
                {e.by}
              </Link>
            ) : (
              e.by
            )}
            {" · "}
          </>
        )}
        {!e.onSelf && (
          <>
            {e.entity}
            {e.entityId ? ` #${e.entityId}` : ""}
            {" · "}
          </>
        )}
        {e.ip ? <span className="tabular-nums">{e.ip}</span> : "no IP"}
        {expandable && (
          <>
            {" · "}
            <button type="button" className="-my-2 py-2 font-semibold text-brand-ink underline-offset-4 hover:underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "Hide details" : "Details"}
            </button>
          </>
        )}
      </p>
      {open && (
        <div className="mt-2 space-y-2">
          {e.reason && (
            <p className="text-caption text-ink-2">
              <span className="mr-2 text-ink-3">Reason</span>
              {e.reason}
            </p>
          )}
          <AuditDiff rows={e.diff} />
        </div>
      )}
    </li>
  );
}

export function UserTimeline({
  days,
  page,
  pageCount,
  total,
  baseHref,
}: {
  days: { day: string; label: string; entries: TimelineEntry[] }[];
  page: number;
  pageCount: number;
  total: number;
  baseHref: string;
}) {
  if (!days.length) return <EmptyState icon={History} title="No activity yet">Sign-ins and changes will show up here.</EmptyState>;
  return (
    <div>
      <ol className="space-y-6 px-4 py-5 sm:px-6">
        {days.map((d) => (
          <li key={d.day}>
            <h4 className="sticky top-0 z-10 -mx-1 mb-3 bg-raised px-1 py-1 text-label text-ink tabular-nums">{d.label}</h4>
            <ul className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-line">
              {d.entries.map((e) => (
                <Entry key={e.id} e={e} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className={T.footer}>
        <span>
          <span className="tabular-nums">{total.toLocaleString("en-IN")}</span> entries
        </span>
        <div className="flex items-center gap-1">
          {page > 1 ? (
            <Button variant="outline" size="icon" className="size-11 sm:size-8" asChild aria-label="Newer">
              <Link href={`${baseHref}?page=${page - 1}`} scroll={false}>
                <ChevronLeft />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled aria-label="Newer">
              <ChevronLeft />
            </Button>
          )}
          <span className="px-2 tabular-nums">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button variant="outline" size="icon" className="size-11 sm:size-8" asChild aria-label="Older">
              <Link href={`${baseHref}?page=${page + 1}`} scroll={false}>
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="size-11 sm:size-8" disabled aria-label="Older">
              <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
