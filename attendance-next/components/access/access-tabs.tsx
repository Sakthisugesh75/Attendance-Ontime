import { Activity, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AccessTab } from "@/lib/validations/access";

const TABS: { key: AccessTab; label: string; icon: typeof ShieldCheck }[] = [
  { key: "roles", label: "Roles", icon: ShieldCheck },
  { key: "users", label: "Users", icon: UsersRound },
  { key: "activity", label: "Activity", icon: Activity },
];

/** Section switcher; each tab is its own URL (?tab=) so it survives refresh and back. */
export function AccessTabs({ active }: { active: AccessTab }) {
  return (
    <nav aria-label="Access sections" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.key === "roles" ? "/access" : `/access?tab=${t.key}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative flex h-11 items-center gap-2 rounded-xs px-3 text-label whitespace-nowrap transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10",
              on ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            <t.icon aria-hidden className="size-4" />
            {t.label}
            {on && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 bg-ink" />}
          </Link>
        );
      })}
    </nav>
  );
}
