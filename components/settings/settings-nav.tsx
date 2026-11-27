import { Building2, CalendarRange, ClipboardList, Clock, DatabaseBackup, FileText, MapPin, Network, Plane, SlidersHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/validations/settings";

const ICONS: Record<SettingsTab, LucideIcon> = {
  company: Building2,
  "working-week": CalendarRange,
  shifts: Clock,
  "leave-types": Plane,
  policies: SlidersHorizontal,
  punching: MapPin,
  organisation: Network,
  "report-forms": ClipboardList,
  exports: FileText,
  backup: DatabaseBackup,
};

const HINTS: Record<SettingsTab, string> = {
  company: "Name, address, logo",
  "working-week": "Weekly offs, custom days",
  shifts: "Timings and thresholds",
  "leave-types": "Quotas and balances",
  policies: "WFH and permission caps",
  punching: "Geofence and selfie",
  organisation: "Departments, designations",
  "report-forms": "Daily report fields",
  exports: "Letterhead, signatures, columns",
  backup: "Download and restore data",
};

/** Sub-navigation: sticky column on desktop, horizontally scrolling tabs on phones. */
export function SettingsNav({ active }: { active: SettingsTab }) {
  return (
    <nav aria-label="Settings sections" className="-mx-4 min-w-0 sm:-mx-6 lg:sticky lg:top-20 lg:mx-0 lg:self-start">
      <ul className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:px-6 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
        {SETTINGS_TABS.map(({ key, label }) => {
          const Icon = ICONS[key];
          const current = key === active;
          return (
            <li key={key} className="shrink-0">
              <Link
                href={`/settings?tab=${key}`}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-1.5 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand max-lg:rounded-full lg:min-h-0 lg:border-transparent lg:py-2",
                  current ? "border-transparent bg-brand-subtle text-brand-ink" : "border-line bg-surface text-ink-2 hover:text-ink lg:bg-transparent lg:hover:bg-sunken",
                )}
              >
                <Icon aria-hidden className={cn("size-[18px] shrink-0", current ? "text-brand-ink" : "text-ink-3")} />
                <span className="min-w-0">
                  <span className="block">{label}</span>
                  <span className={cn("hidden text-caption lg:block", current ? "text-brand-ink" : "text-ink-3")}>{HINTS[key]}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
