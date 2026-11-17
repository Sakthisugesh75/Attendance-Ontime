import { ClockAlert, House, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Illustration } from "@/components/ui/illustration";
import type { Overview } from "@/lib/attendance/overview";
import { addDays, formatDate } from "@/lib/time";

/** Things HR should look at: missing punch-outs, repeated lateness, WFH / permission over the cap. */
export function AttentionPanel({ attention, month }: { attention: Overview["attention"]; month: string }) {
  const total = attention.missingPunchOut.length + attention.repeatedLate.length + attention.overCap.length;
  const link = (id: number) => `/attendance?month=${month}&employee=${id}`;

  if (!total) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <Illustration name="thumbs" size={88} float />
        <p className="mt-4 text-title-3 text-ink">Nothing needs attention</p>
        <p className="mt-1 max-w-xs text-body text-ink-2">No missing punch-outs, repeated lateness or caps exceeded this month.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {attention.missingPunchOut.length > 0 && (
        <Group icon={TriangleAlert} tone="bg-st-absent-tint text-st-absent-fg" title="Missing punch-outs" count={attention.missingPunchOut.length}>
          {attention.missingPunchOut.slice(0, 6).map((m) => (
            <Row key={`${m.id}-${m.date}`} href={link(m.id)} name={m.name} detail={formatDate(m.date)} />
          ))}
          {attention.missingPunchOut.length > 6 && <More n={attention.missingPunchOut.length - 6} />}
        </Group>
      )}
      {attention.repeatedLate.length > 0 && (
        <Group icon={ClockAlert} tone="bg-st-late-tint text-st-late-fg" title="Late 3+ times in a week" count={attention.repeatedLate.length}>
          {attention.repeatedLate.slice(0, 6).map((r) => (
            <Row
              key={`${r.id}-${r.weekStart}`}
              href={link(r.id)}
              name={r.name}
              detail={`${r.count}× · week of ${formatDate(r.weekStart).slice(0, 6)}–${formatDate(addDays(r.weekStart, 6)).slice(0, 6)}`}
            />
          ))}
          {attention.repeatedLate.length > 6 && <More n={attention.repeatedLate.length - 6} />}
        </Group>
      )}
      {attention.overCap.length > 0 && (
        <Group icon={House} tone="bg-st-present-tint text-st-present-fg" title="Over the monthly cap" count={attention.overCap.length}>
          {attention.overCap.map((o) => (
            <Row key={`${o.id}-${o.kind}`} href={link(o.id)} name={o.name} detail={`${o.kind === "WFH" ? "WFH" : "Permission"} ${o.count} / ${o.cap}`} />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ icon: Icon, tone, title, count, children }: { icon: typeof TriangleAlert; tone: string; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mb-2 flex items-center gap-2.5">
        <span aria-hidden className={`grid size-8 place-items-center rounded-md ${tone}`}>
          <Icon className="size-4" />
        </span>
        <span className="text-body font-medium text-ink">{title}</span>
        <span className="ml-auto rounded-full bg-sunken px-2 py-0.5 text-caption text-ink-2 tabular-nums">{count}</span>
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Row({ href, name, detail }: { href: string; name: string; detail: string }) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-body text-ink outline-none transition-colors duration-[120ms] hover:bg-sunken focus-visible:shadow-[var(--ad-focus)] md:min-h-9"
      >
        <span className="truncate">{name}</span>
        <span className="shrink-0 text-caption text-ink-3 tabular-nums">{detail}</span>
      </Link>
    </li>
  );
}

function More({ n }: { n: number }) {
  return <li className="px-2 pt-1 text-caption text-ink-3 tabular-nums">+{n} more</li>;
}
