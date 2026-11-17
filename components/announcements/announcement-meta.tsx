import { addDays, formatDate, formatTime, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/** "Today, 09:40 AM" / "Yesterday, 05:10 PM" / "02 Nov 2026" in IST. */
export function postedLabel(createdAt: string, today: string): string {
  const day = istDate(new Date(createdAt));
  if (day === today) return `Today, ${formatTime(createdAt)}`;
  if (day === addDays(today, -1)) return `Yesterday, ${formatTime(createdAt)}`;
  return formatDate(day);
}

/** Posted in the last three days. */
export const isFresh = (createdAt: string, today: string) => istDate(new Date(createdAt)) >= addDays(today, -2);

/** "Until 30 Nov" (this year) / "Until 15 Jan 2027" / "Last day today". */
export function untilLabel(expiresOn: string, today: string): string {
  if (!expiresOn) return "";
  if (expiresOn === today) return "Last day today";
  const d = formatDate(expiresOn);
  return `Until ${expiresOn.slice(0, 4) === today.slice(0, 4) ? d.slice(0, 6) : d}`;
}

/** Plain-text body with its line breaks kept; long words and links wrap instead of overflowing. */
export function AnnouncementBody({ body, className }: { body: string; className?: string }) {
  return <p className={cn("text-body leading-6 [overflow-wrap:anywhere] whitespace-pre-line", className)}>{body}</p>;
}
