import Link from "next/link";
import { Illustration, type ArtName } from "@/components/ui/illustration";
import { cn } from "@/lib/utils";

const ACTIONS: { href: string; title: [string, string]; cta: string; art: ArtName; primary?: boolean }[] = [
  { href: "/requests?view=mine&new=LEAVE", title: ["Apply", "leave"], cta: "Plan a break", art: "palm" },
  { href: "/requests?view=mine&new=PERMISSION", title: ["Short", "permission"], cta: "Ask for hours", art: "hourglass" },
  { href: "/requests?view=mine&new=WFH", title: ["Work from", "home"], cta: "Request WFH", art: "house" },
  { href: "/daily-reports?view=mine", title: ["Daily", "report"], cta: "Write today's", art: "memo", primary: true },
];
/** In place of the report tile for people whose role doesn't send daily reports. */
const CALENDAR = { href: "/attendance", title: ["My", "calendar"] as [string, string], cta: "See the month", art: "calendar" as ArtName };

/**
 * One-tap shortcuts to what employees do most: a title, 3D art and a pill (DESIGN.md §0, "3D art").
 * `stacked`: always 2 × 2 and fills the height beside the Today card; otherwise 4 across on wide screens.
 */
export function QuickActions({ className, stacked, writesReports = true }: { className?: string; stacked?: boolean; writesReports?: boolean }) {
  const actions = writesReports ? ACTIONS : [...ACTIONS.slice(0, 3), CALENDAR];
  return (
    <section aria-labelledby="quick-actions" className={cn("flex flex-col", className)}>
      <h3 id="quick-actions" className="mb-3 text-m-section text-ink">
        Quick actions
      </h3>
      <ul className={cn("grid grid-cols-2 gap-2.5 sm:gap-3", !stacked && "lg:grid-cols-4", stacked && "lg:flex-1 lg:auto-rows-fr")}>
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              aria-label={`${a.title.join(" ")}: ${a.cta}`}
              className="group flex h-full flex-col gap-3 rounded-lg bg-surface p-3.5 shadow-card transition-[background-color,transform] duration-[120ms] outline-none hover:-translate-y-0.5 hover:bg-raised focus-visible:shadow-[var(--ad-focus)] sm:p-4"
            >
              <span className="flex min-h-14 items-start justify-between gap-2">
                <span className="text-[16px] leading-5 font-medium tracking-[-0.01em] text-ink sm:text-[17px] sm:leading-[22px]">
                  {a.title[0]}
                  <br />
                  {a.title[1]}
                </span>
                <Illustration name={a.art} size={56} className={cn("-mt-1 -mr-1 transition-transform duration-[180ms] group-hover:-translate-y-0.5 group-hover:-rotate-3", stacked && "lg:size-[88px]")} />
              </span>
              <span
                className={cn(
                  "mt-auto flex h-9 items-center justify-center rounded-full text-[13px] font-medium",
                  "primary" in a && a.primary ? "bg-butter text-on-butter" : "bg-glass text-ink ring-1 ring-line ring-inset",
                )}
              >
                {a.cta}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
