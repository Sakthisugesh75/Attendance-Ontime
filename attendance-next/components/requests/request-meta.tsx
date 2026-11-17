import { Paperclip } from "lucide-react";
import type { RequestRow } from "@/lib/requests";
import { formatDate, formatHhmm } from "@/lib/time";
import { fmtDays, HALF_DAY_LABEL } from "@/lib/validations/requests";

/** "14 – 16 Jan 2027", "30 Jan – 02 Feb 2027", "30 Dec 2026 – 02 Jan 2027" (DESIGN.md §4.5) */
export function dateRange(from: string, to: string): string {
  if (from === to) return formatDate(from);
  const a = formatDate(from);
  const b = formatDate(to);
  if (a.slice(2) === b.slice(2)) return `${a.slice(0, 2)} – ${b}`;
  return a.slice(-4) === b.slice(-4) ? `${a.slice(0, 6)} – ${b}` : `${a} – ${b}`;
}

/** Second line of a request: days / half / time window. */
export function requestWhen(r: Pick<RequestRow, "type" | "fromDate" | "toDate" | "halfDay" | "startTime" | "endTime" | "days">): string {
  const parts = [dateRange(r.fromDate, r.toDate)];
  if (r.halfDay) parts.push(HALF_DAY_LABEL[r.halfDay]);
  else if ((r.type === "LEAVE" || r.type === "WFH" || r.type === "ON_DUTY") && r.days !== null && !(r.fromDate === r.toDate && r.days === 1)) parts.push(fmtDays(r.days));
  if (r.type === "REGULARIZATION") {
    const fix = [r.startTime && `in ${formatHhmm(r.startTime)}`, r.endTime && `out ${formatHhmm(r.endTime)}`].filter(Boolean).join(", ");
    if (fix) parts.push(fix);
  } else if (r.startTime && r.endTime) parts.push(`${formatHhmm(r.startTime)} – ${formatHhmm(r.endTime)}`);
  return parts.join(" · ");
}

export function AttachmentLink({ id }: { id: number }) {
  return (
    <a
      href={`/api/requests/${id}/attachment`}
      target="_blank"
      rel="noopener"
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-caption text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      <Paperclip aria-hidden className="size-3.5" /> Attachment
    </a>
  );
}
