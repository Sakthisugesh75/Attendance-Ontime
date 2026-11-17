"use client";

import { BarChart3, CalendarDays, CalendarHeart, Grid3x3, House, Inbox, Megaphone, Menu, NotebookPen, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { navFor, type NavAccess } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

/**
 * Dock candidates in priority order, with a short name and dock icon. Which ones show is decided by
 * the same rule as the sidebar (role permissions + employee record + daily-report duty).
 */
const DOCK: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/requests", label: "Requests", icon: Inbox },
  { href: "/daily-reports", label: "Report", icon: NotebookPen },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/muster", label: "Muster roll", icon: Grid3x3 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/holidays", label: "Holidays", icon: CalendarHeart },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
];

/**
 * Phone dock (DESIGN.md §0): the four most useful modules this person's role allows, plus "More"
 * for the full menu. Hidden from tablet width up, where the sidebar shows.
 */
export function BottomNav({ access }: { access: NavAccess }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const allowed = new Set(navFor(NAV, access).map((i) => i.href));
  const tabs = DOCK.filter((t) => allowed.has(t.href)).slice(0, 4);
  // Icon-only circles in a floating glass dock; the name stays for screen readers and tests.
  const item = "relative grid size-12 place-items-center rounded-full border transition-colors duration-[120ms] outline-none focus-visible:shadow-[var(--ad-focus)]";
  return (
    <nav aria-label="Main" className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex h-[62px] items-center justify-between rounded-full px-[7px] md:hidden">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn(item, active ? "border-transparent bg-brand text-on-brand shadow-brand" : "border-line bg-glass text-ink-2 hover:text-ink")}>
            <t.icon aria-hidden className="size-5" strokeWidth={active ? 2.1 : 1.75} />
            <span className="sr-only">{t.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={() => setOpenMobile(true)} className={cn(item, "border-line bg-glass text-ink-2 hover:text-ink")}>
        <Menu aria-hidden className="size-5" strokeWidth={1.75} />
        <span className="sr-only">More</span>
      </button>
    </nav>
  );
}
