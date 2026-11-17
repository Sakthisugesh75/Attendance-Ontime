"use client";

import { CalendarDays, CornerDownLeft, KeyRound, Loader2, LogOut, Plus, Search, SunMoon, UserPlus, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { logout } from "@/lib/actions/auth";
import { can } from "@/lib/access/permissions";
import { currentAccess, searchEmployees, type EmployeeHit } from "@/lib/actions/search";
import { filterPalette, navFor, type NavAccess } from "@/lib/palette";
import { NAV } from "./nav";

interface ActionEntry {
  id: string;
  label: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
  /** Only for people who can add employees */
  needsManage?: boolean;
  run: () => void;
}

/** ⌘K / Ctrl K hint matching the visitor's platform (decided after mount to avoid a hydration mismatch). */
function useShortcutLabel() {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)), []);
  return mac ? "⌘K" : "Ctrl K";
}

/**
 * Global command palette: search trigger for the top bar plus the ⌘K / Ctrl K dialog.
 * Pages come from NAV (filtered by permission); people with employees.view also search the
 * employees in their reach (the server filters the results; this only hides the UI).
 */
export function CommandPalette({ access: accessProp }: { access?: NavAccess }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const shortcut = useShortcutLabel();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fetchedAccess, setFetchedAccess] = useState<NavAccess | null>(null);
  const access = accessProp ?? fetchedAccess;
  const manager = access !== null && can(access, "employees.view");
  const canAdd = access !== null && can(access, "employees.manage");

  const [hits, setHits] = useState<EmployeeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  // Global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Access isn't passed by the layout: ask once, the first time the palette opens.
  useEffect(() => {
    if (!open || accessProp || fetchedAccess) return;
    currentAccess()
      .then(setFetchedAccess)
      .catch(() => {});
  }, [open, accessProp, fetchedAccess]);

  // Debounced employee search; stale responses are ignored.
  const term = query.trim();
  useEffect(() => {
    if (!manager || term.length < 2) {
      seq.current++;
      setHits([]);
      setSearching(false);
      return;
    }
    const id = ++seq.current;
    setSearching(true);
    const t = setTimeout(() => {
      searchEmployees(term)
        .then((r) => id === seq.current && setHits(r))
        .catch(() => id === seq.current && setHits([]))
        .finally(() => id === seq.current && setSearching(false));
    }, 220);
    return () => clearTimeout(t);
  }, [term, manager]);

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) setQuery("");
  };

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const go = (href: string) => run(() => router.push(href));

  const pages = useMemo(() => navFor(NAV, access).map((i) => ({ ...i, id: `page:${i.href}`, group: i.section })), [access]);

  const actions = useMemo<ActionEntry[]>(
    () =>
      [
        { id: "act:attendance", label: "Go to my attendance", keywords: "history calendar days punches", icon: CalendarDays, run: () => router.push("/attendance") },
        { id: "act:request", label: "New request", keywords: "leave wfh permission on duty regularization apply", icon: Plus, run: () => router.push("/requests?new=1") },
        { id: "act:employee", label: "Add employee", keywords: "new staff hire create", icon: UserPlus, needsManage: true, run: () => router.push("/employees") },
        { id: "act:theme", label: "Toggle theme", keywords: "dark light mode appearance", icon: SunMoon, run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark") },
        { id: "act:password", label: "Change password", keywords: "security account", icon: KeyRound, run: () => router.push("/change-password") },
        { id: "act:logout", label: "Sign out", keywords: "log out logout exit", icon: LogOut, run: () => void logout() },
      ].filter((a) => !a.needsManage || canAdd),
    [router, setTheme, resolvedTheme, canAdd],
  );

  const shownPages = filterPalette(pages, query);
  const shownActions = filterPalette(actions, query);
  const nothing = !shownPages.length && !shownActions.length && !hits.length && !searching;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={`Search (${shortcut})`}
        aria-keyshortcuts="Control+K Meta+K"
        className="size-11 gap-2 rounded-md border-line bg-surface px-0 font-normal text-ink-3 shadow-none hover:border-line-strong hover:bg-surface hover:text-ink-2 sm:h-9 sm:w-56 sm:justify-start sm:px-3 lg:w-64"
      >
        <Search className="size-4" />
        <span className="hidden flex-1 text-left text-body sm:inline">Search…</span>
        <kbd className="pointer-events-none hidden h-5 items-center rounded-xs border border-line bg-sunken px-1.5 text-caption text-ink-3 select-none sm:inline-flex">
          {shortcut}
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search pages, people and actions" className="top-[12vh] overflow-hidden rounded-xl border-line bg-raised shadow-lg sm:max-w-xl">
        <Command shouldFilter={false} loop className="bg-raised">
          <CommandInput value={query} onValueChange={setQuery} placeholder={manager ? "Search pages, employees, actions…" : "Search pages and actions…"} aria-label="Search" />
          <CommandList className="max-h-[min(60vh,26rem)]">
            {nothing && <CommandEmpty>No results for “{term}”.</CommandEmpty>}

            {shownPages.length > 0 && (
              <CommandGroup heading="Pages">
                {shownPages.map((p) => (
                  <CommandItem key={p.id} value={p.id} onSelect={() => go(p.href)}>
                    <p.icon className="text-ink-3" />
                    <span className="truncate">{p.label}</span>
                    <CommandShortcut className="text-caption tracking-normal text-ink-3">{p.section}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {manager && term.length >= 2 && (hits.length > 0 || searching) && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Employees">
                  {hits.map((e) => (
                    <CommandItem key={e.id} value={`emp:${e.id}`} onSelect={() => go(`/employees/${e.id}`)}>
                      <UserRound className="text-ink-3" />
                      <span className="min-w-0 truncate">
                        {e.name}
                        {e.detail && <span className="ml-2 text-caption text-ink-3">{e.detail}</span>}
                      </span>
                      <CommandShortcut className="text-caption tracking-normal text-ink-3 tabular-nums">{e.code}</CommandShortcut>
                    </CommandItem>
                  ))}
                  {searching && hits.length === 0 && (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-body text-ink-3" role="status">
                      <Loader2 className="size-4 animate-spin" /> Searching employees…
                    </div>
                  )}
                </CommandGroup>
              </>
            )}

            {shownActions.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Actions">
                  {shownActions.map((a) => (
                    <CommandItem key={a.id} value={a.id} onSelect={() => run(a.run)}>
                      <a.icon className="text-ink-3" />
                      <span className="truncate">{a.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <div className="hidden items-center gap-4 border-t border-line px-3 py-2 text-caption text-ink-3 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> move
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>
                <CornerDownLeft className="size-3" />
              </Kbd>
              open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-sunken px-1 text-caption text-ink-2">{children}</kbd>;
}
