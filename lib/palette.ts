/**
 * Pure helpers for the command palette and the top-bar breadcrumbs (unit-tested).
 * Both read the sidebar's NAV so labels stay in one place.
 */
import { can, type Access, type Permission } from "@/lib/access/permissions";

export interface PaletteEntry {
  id: string;
  label: string;
  keywords?: string;
  group?: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Score of one entry for a query: 0 = no match. Every word of the query must appear in the
 * label, keywords or group; label hits outrank keyword hits, and prefixes outrank substrings.
 */
export function paletteScore(entry: PaletteEntry, query: string): number {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const label = norm(entry.label);
  const labelWords = label.split(/[\s/-]+/);
  const extra = norm(`${entry.keywords ?? ""} ${entry.group ?? ""}`);
  let score = 0;
  for (const w of words) {
    if (label.startsWith(w)) score += 8;
    else if (labelWords.some((lw) => lw.startsWith(w))) score += 6;
    else if (label.includes(w)) score += 4;
    else if (extra.split(/\s+/).some((k) => k.startsWith(w))) score += 2;
    else if (extra.includes(w)) score += 1;
    else return 0;
  }
  return score;
}

/** Entries matching `query`, best first (stable for ties). An empty query keeps every entry in order. */
export function filterPalette<T extends PaletteEntry>(entries: T[], query: string): T[] {
  if (!query.trim()) return entries;
  return entries
    .map((e, i) => ({ e, i, s: paletteScore(e, query) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.e);
}

interface NavLike {
  label: string;
  items: { href: string; label: string; perm?: Permission; keywords?: string }[];
}

export type NavAccess = Pick<Access, "isSuperAdmin" | "permissions"> & {
  /** Linked to an employee record (own attendance, own requests). */
  hasEmployee?: boolean;
  /** Expected to send daily reports. */
  writesReports?: boolean;
};

/**
 * True if the access may open a NAV item: open to everyone when it names neither a permission nor
 * a need; otherwise the permission OR the need (employee record / writes daily reports) is enough.
 */
export function navAllowed(item: { perm?: Permission; needs?: "employee" | "reports" }, access: NavAccess | null): boolean {
  if (!item.perm && !item.needs) return true;
  if (access === null) return false;
  const need = item.needs === "employee" ? !!access.hasEmployee : item.needs === "reports" ? !!access.writesReports : false;
  return need || (!!item.perm && can(access, item.perm));
}

/** NAV items the access may open, flattened with their section label. */
export function navFor<G extends NavLike>(nav: G[], access: NavAccess | null): (G["items"][number] & { section: string })[] {
  return nav.flatMap((g) => g.items.filter((i) => navAllowed(i, access)).map((i) => ({ ...i, section: g.label })));
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Labels for detail pages under a NAV item ("/employees/12" -> "Profile"). */
const DETAIL_LABEL: Record<string, string> = { "/employees": "Profile", "/import": "Review" };
/** Pages that aren't in the sidebar. */
const EXTRA_PAGES: Record<string, string> = { "/notifications": "Notifications", "/change-password": "Change password" };

/**
 * Breadcrumb trail for a pathname: "Section › Page" for sidebar pages and
 * "Page › Profile" (linking back to the list) for detail pages.
 */
export function breadcrumbsFor(pathname: string, nav: NavLike[]): Crumb[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const g of nav) {
    for (const item of g.items) {
      if (path === item.href) return [{ label: g.label }, { label: item.label }];
      if (path.startsWith(`${item.href}/`)) return [{ label: item.label, href: item.href }, { label: DETAIL_LABEL[item.href] ?? "Details" }];
    }
  }
  const extra = EXTRA_PAGES[path];
  return extra ? [{ label: extra }] : [];
}
