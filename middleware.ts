import { NextResponse } from "next/server";
import { canAny, type Permission } from "@/lib/access/permissions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PUBLIC = ["/login", "/forgot-password", "/reset-password"];
/**
 * Pages that need a permission. Uses the permissions mirrored in the session token (refreshed
 * every minute), so it only avoids a flash: every page, action and route checks again on the server.
 */
const PERMISSION_PAGES: { prefix: string; perms: Permission[] }[] = [
  { prefix: "/settings", perms: ["settings.manage"] },
  { prefix: "/audit-log", perms: ["audit.view"] },
  { prefix: "/access", perms: ["access.manage"] },
  { prefix: "/employees", perms: ["employees.view"] },
  { prefix: "/import", perms: ["import.run"] },
  { prefix: "/muster", perms: ["attendance.view"] },
  { prefix: "/reports", perms: ["reports.view"] },
];

/**
 * The token is only re-checked against the database every few minutes, but pages check every
 * request. After "sign out everywhere", a disabled sign-in or a deleted account the pages send
 * the visitor to /login while the token still looks valid here; without this check the two
 * would redirect to each other forever. Only runs for sign-in pages, so it costs one query there.
 */
async function sessionStillValid(id: string, sessionVersion: number | undefined): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: Number(id) }, select: { isActive: true, sessionVersion: true } });
  return !!row && row.isActive && row.sessionVersion === (sessionVersion ?? 0);
}

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  const user = req.auth?.user;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user) {
    if (isPublic) return NextResponse.next();
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // A revoked session may still use the sign-in pages (checked first so no redirect can loop).
  if (isPublic && !(await sessionStillValid(user.id, user.sessionVersion))) return NextResponse.next();
  if (user.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.nextUrl));
  }
  if (isPublic || pathname === "/") return NextResponse.redirect(new URL("/dashboard", req.nextUrl));

  const rule = PERMISSION_PAGES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (rule && !canAny({ isSuperAdmin: !!user.isSuperAdmin, permissions: user.permissions ?? [] }, ...rule.perms)) return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  return NextResponse.next();
});

export const config = {
  runtime: "nodejs",
  // Skip API routes (they check auth themselves), Next internals and static/PWA files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|offline|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};
