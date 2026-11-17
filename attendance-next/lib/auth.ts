import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Role } from "@prisma/client";
import { accessOf, type Permission, type Scope } from "@/lib/access/permissions";
import { loginSchema } from "@/lib/auth-schemas";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { hitRateLimit, isRateLimited } from "@/lib/rate-limit";

declare module "next-auth" {
  interface User {
    role: Role;
    employeeId: number | null;
    mustChangePassword: boolean;
    remember: boolean;
    sessionVersion: number;
    isSuperAdmin: boolean;
    permissions: Permission[];
    scope: Scope;
    roleName: string;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      employeeId: number | null;
      mustChangePassword: boolean;
      sessionVersion: number;
      /** Mirrors the role for navigation only; servers re-check permissions from the database. */
      isSuperAdmin: boolean;
      permissions: Permission[];
      scope: Scope;
      roleName: string;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid: number;
    role: Role;
    employeeId: number | null;
    mustChangePassword: boolean;
    sv: number;
    isSuperAdmin: boolean;
    perms: Permission[];
    scope: Scope;
    roleName: string;
    /** Epoch ms after which the session is refused (12 h, or 30 days with "remember me"). */
    expiresAt: number;
    refreshedAt: number;
  }
}

const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;
const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
/** How often the token re-reads role, access, active flag and session version from the database. */
const REFRESH_MS = 60 * 1000;
/** Failed sign-ins allowed per network address per window (on top of the per-account lockout). */
const FAILED_PER_IP = 30;
const IP_WINDOW_MS = 15 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export class InvalidLogin extends CredentialsSignin {
  code = "invalid";
}
export class LockedLogin extends CredentialsSignin {
  code = "locked";
}
export class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}


/** Email (case-insensitive), a 10-digit Indian mobile (optional +91 / spaces), or a username. */
function identifierWhere(identifier: string) {
  if (identifier.includes("@")) return { email: identifier.toLowerCase() };
  // Only digits, spaces, + and -: a phone number. Anything else is a username.
  if (/^[\d\s+-]+$/.test(identifier)) return { phone: identifier.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") };
  return { username: identifier.toLowerCase() };
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt", maxAge: LONG_SESSION_MS / 1000 },
  pages: { signIn: "/login" },
  trustHost: true,
  logger: {
    // Wrong passwords are expected; keep the log for real failures.
    error(error) {
      if (error instanceof CredentialsSignin || error.name === "CredentialsSignin") return;
      // Auth.js wraps the real problem (often "database not reachable") in `cause`; print it plainly.
      const cause = (error as { cause?: { err?: unknown } }).cause;
      const inner = cause?.err ?? cause;
      const reason = inner instanceof Error ? `${inner.name}: ${inner.message.split("\n").filter(Boolean).slice(-2).join(" ")}` : inner ? String(inner) : "";
      console.error(`[auth] ${error.name}${reason ? ` → ${reason}` : ""}`);
    },
  },
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {}, remember: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidLogin();
        const { identifier, password, remember } = parsed.data;

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        // Only failed attempts count, so a whole office signing in from one IP is never blocked.
        const ipKey = `login-failed:${ip}`;
        if (isRateLimited(ipKey, FAILED_PER_IP, IP_WINDOW_MS)) throw new RateLimited();

        const user = await prisma.user.findFirst({ where: identifierWhere(identifier), include: { employee: true, accessRole: true } });
        const now = new Date();
        if (!user || !user.isActive) {
          // Compare anyway so response time doesn't reveal whether the account exists.
          await bcrypt.compare(password, DUMMY_HASH);
          hitRateLimit(ipKey, FAILED_PER_IP, IP_WINDOW_MS);
          // Every failed attempt is visible to the Super Admin in the activity log.
          await writeAudit({
            actorId: user?.id ?? null,
            action: "LOGIN_FAILED",
            entity: "User",
            entityId: user?.id ?? null,
            after: { identifier: identifier.slice(0, 100), reason: user ? "sign-in disabled" : "no such account" },
            ip,
          });
          throw new InvalidLogin();
        }
        if (user.lockedUntil && user.lockedUntil > now) {
          await writeAudit({ actorId: user.id, action: "LOGIN_FAILED", entity: "User", entityId: user.id, after: { reason: "account locked" }, ip });
          throw new LockedLogin();
        }

        if (!(await bcrypt.compare(password, user.passwordHash))) {
          hitRateLimit(ipKey, FAILED_PER_IP, IP_WINDOW_MS);
          const failed = user.failedLoginCount + 1;
          const lock = failed >= MAX_FAILED;
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MS) : null },
          });
          if (lock) {
            await writeAudit({ actorId: user.id, action: "LOCKED", entity: "User", entityId: user.id, ip });
            throw new LockedLogin();
          }
          await writeAudit({ actorId: user.id, action: "LOGIN_FAILED", entity: "User", entityId: user.id, after: { reason: "wrong password", attempt: failed }, ip });
          throw new InvalidLogin();
        }

        await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, lastSeenAt: now } });
        await writeAudit({ actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id, ip });

        return {
          id: String(user.id),
          name: user.employee?.fullName || user.name || user.email || "User",
          email: user.email ?? "",
          role: user.role,
          employeeId: user.employee?.id ?? null,
          mustChangePassword: user.mustChangePassword,
          remember,
          sessionVersion: user.sessionVersion,
          ...accessOf(user),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      const now = Date.now();
      if (user) {
        token.uid = Number(user.id);
        token.role = user.role;
        token.employeeId = user.employeeId;
        token.mustChangePassword = user.mustChangePassword;
        token.sv = user.sessionVersion;
        token.isSuperAdmin = user.isSuperAdmin;
        token.perms = user.permissions;
        token.scope = user.scope;
        token.roleName = user.roleName;
        token.expiresAt = now + (user.remember ? LONG_SESSION_MS : SHORT_SESSION_MS);
        token.refreshedAt = now;
        return token;
      }
      if (!token.uid || now > token.expiresAt) return null;

      // Pick up access changes, deactivation and "sign out everywhere" without waiting for a new sign-in.
      if (trigger === "update" || now - token.refreshedAt > REFRESH_MS) {
        const fresh = await prisma.user.findUnique({ where: { id: token.uid }, include: { employee: { select: { id: true, fullName: true } }, accessRole: true } });
        if (!fresh || !fresh.isActive || fresh.sessionVersion !== (token.sv ?? 0)) return null;
        const access = accessOf(fresh);
        token.isSuperAdmin = access.isSuperAdmin;
        token.perms = access.permissions;
        token.scope = access.scope;
        token.roleName = access.roleName;
        // "Online now" for the activity view (this runs at most once a minute per user).
        await prisma.user.update({ where: { id: fresh.id }, data: { lastSeenAt: new Date(now) } });
        token.role = fresh.role;
        token.employeeId = fresh.employee?.id ?? null;
        token.mustChangePassword = fresh.mustChangePassword;
        token.name = fresh.employee?.fullName || fresh.name || fresh.email || "User";
        token.refreshedAt = now;
      }
      return token;
    },
    session({ session, token }) {
      session.user = {
        ...session.user,
        id: String(token.uid),
        name: token.name ?? "",
        email: token.email ?? "",
        role: token.role,
        employeeId: token.employeeId,
        mustChangePassword: token.mustChangePassword,
        sessionVersion: token.sv ?? 0,
        isSuperAdmin: token.isSuperAdmin ?? token.role === "SUPER_ADMIN",
        permissions: token.perms ?? [],
        scope: token.scope ?? "SELF",
        roleName: token.roleName ?? "",
      };
      return session;
    },
  },
});
