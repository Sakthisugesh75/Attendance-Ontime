/**
 * Access & roles: shared schemas and the pure guard-rail rules. No server or DOM imports, so
 * the role editor (client), the server actions and the unit tests all use the same rules.
 */
import { z } from "zod";
import { PERMISSION_KEYS, PERMISSIONS, SCOPE_LABEL, type Permission, type Scope } from "@/lib/access/permissions";

// ---- Role form ----------------------------------------------------------------

export const SCOPES = ["ALL", "TEAM", "SELF"] as const satisfies readonly Scope[];

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Give the role a name").max(80, "Keep the name under 80 characters"),
  description: z.string().trim().max(300, "Keep the description under 300 characters"),
  scope: z.enum(SCOPES),
  permissions: z.array(z.enum(PERMISSION_KEYS as [Permission, ...Permission[]])).max(PERMISSION_KEYS.length),
  /** People with this role send daily reports (each employee can override it). */
  dailyReports: z.boolean(),
});
export type RoleInput = z.infer<typeof roleSchema>;

export type SystemKey = "SUPER_ADMIN" | "HR" | "EMPLOYEE";

// ---- URL params ---------------------------------------------------------------

export const ACCESS_TABS = ["roles", "users", "activity"] as const;
export type AccessTab = (typeof ACCESS_TABS)[number];

export const USER_STATUSES = ["active", "pending", "locked", "disabled", "online"] as const;
export type UserStatusFilter = (typeof USER_STATUSES)[number];

export const accessParamsSchema = z.object({
  tab: z.enum(ACCESS_TABS).catch("roles"),
  q: z.string().trim().max(100).catch(""),
  role: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.enum(USER_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type AccessParams = z.infer<typeof accessParamsSchema>;

export function parseAccessParams(raw: Record<string, string | string[] | undefined>): AccessParams {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) || undefined]));
  return accessParamsSchema.parse(flat);
}

export const ACCESS_PAGE_SIZE = 25;
export const TIMELINE_PAGE_SIZE = 50;

// ---- Sign-in status and presence -----------------------------------------------

/** Someone counts as online when their last authenticated request was within this window. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export type SignInStatus = "ACTIVE" | "DISABLED" | "LOCKED" | "PENDING";
export const SIGN_IN_STATUS_LABEL: Record<SignInStatus, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
  LOCKED: "Locked",
  PENDING: "Waiting for first sign-in",
};

export interface SignInState {
  isActive: boolean;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}

/** Disabled beats locked beats "never signed in". */
export function signInStatus(u: SignInState, now: Date = new Date()): SignInStatus {
  if (!u.isActive) return "DISABLED";
  if (u.lockedUntil && u.lockedUntil > now) return "LOCKED";
  if (u.mustChangePassword && !u.lastLoginAt) return "PENDING";
  return "ACTIVE";
}

export const isOnline = (lastSeenAt: Date | null, now: Date = new Date()) => !!lastSeenAt && now.getTime() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS;

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago"; null when never. */
export function timeAgo(when: Date | null, now: Date = new Date()): string | null {
  if (!when) return null;
  const min = Math.max(0, Math.floor((now.getTime() - when.getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo > 1 ? "s" : ""} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y > 1 ? "s" : ""} ago`;
}

// ---- Permissions summary / diff -------------------------------------------------

/** Added and removed permission keys between two versions of a role (catalogue order). */
export function diffPermissions(before: readonly string[], after: readonly string[]): { added: Permission[]; removed: Permission[] } {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: PERMISSION_KEYS.filter((k) => a.has(k) && !b.has(k)),
    removed: PERMISSION_KEYS.filter((k) => b.has(k) && !a.has(k)),
  };
}

/** "Can: View reports, Export reports · Reaches: Own team" */
export function roleSummary(permissions: readonly Permission[], scope: Scope): string {
  const labels = PERMISSION_KEYS.filter((k) => permissions.includes(k)).map((k) => PERMISSIONS[k].label);
  const can = labels.length ? labels.join(", ") : "only their own attendance and requests";
  return `Can: ${can} · Reaches: ${SCOPE_LABEL[scope].label}`;
}

// ---- Guard rails --------------------------------------------------------------

export interface GuardActor {
  id: number;
  isSuperAdmin: boolean;
  permissions: readonly Permission[];
  scope: Scope;
}

const SCOPE_RANK: Record<Scope, number> = { SELF: 0, TEAM: 1, ALL: 2 };

/**
 * A role someone may create or edit: Super Admins grant anything; anyone else (holding
 * access.manage) only permissions they have themselves and no wider reach than their own.
 */
export function grantError(actor: GuardActor, permissions: readonly Permission[], scope: Scope): string | null {
  if (actor.isSuperAdmin) return null;
  const extra = permissions.filter((p) => !actor.permissions.includes(p));
  if (extra.length) return `You can only grant permissions you have yourself (${extra.map((p) => PERMISSIONS[p].label).join(", ")}).`;
  if (SCOPE_RANK[scope] > SCOPE_RANK[actor.scope]) return `You can't give a wider reach than your own (${SCOPE_LABEL[actor.scope].label}).`;
  return null;
}

/** Built-in roles: Super Admin is read-only; HR and Employee keep their names. */
export function roleEditError(role: { systemKey: string | null; name: string }, input: { name: string }): string | null {
  if (role.systemKey === "SUPER_ADMIN") return "The Super Admin role always has every permission and can't be changed.";
  if (role.systemKey && input.name.trim() !== role.name) return "Built-in roles can't be renamed.";
  return null;
}

/** A role may go only if it's custom and either unused or its people are moved to another role first. */
export function roleDeleteError(
  role: { id: number; systemKey: string | null; userCount: number },
  moveTo: { id: number; systemKey: string | null } | null,
  actor: Pick<GuardActor, "isSuperAdmin">,
): string | null {
  if (role.systemKey) return "Built-in roles can't be deleted.";
  if (role.userCount === 0) return null;
  if (!moveTo) return `${role.userCount} ${role.userCount === 1 ? "person has" : "people have"} this role. Move them to another role first.`;
  if (moveTo.id === role.id) return "Pick a different role to move them to.";
  if (moveTo.systemKey === "SUPER_ADMIN" && !actor.isSuperAdmin) return "Only a Super Admin can give someone the Super Admin role.";
  return null;
}

export type UserOp = "role" | "disable" | "enable" | "unlock" | "reset" | "signout";

export interface GuardTarget {
  id: number;
  isSuperAdmin: boolean;
  isActive: boolean;
}

const SELF_MESSAGE: Partial<Record<UserOp, string>> = {
  role: "You can't change your own role.",
  disable: "You can't disable your own sign-in.",
  signout: "You can't sign yourself out everywhere from here. Use Sign out instead.",
  reset: "Use Change password to change your own password.",
};

/**
 * Whether `actor` may perform `op` on `target`. Enforced in the server actions (the UI only
 * hides what this would refuse). `activeSuperAdmins` counts active Super Admin accounts now.
 */
export function userActionError(
  actor: Pick<GuardActor, "id" | "isSuperAdmin">,
  target: GuardTarget,
  op: UserOp,
  ctx: { activeSuperAdmins: number; newRoleIsSuperAdmin?: boolean },
): string | null {
  if (actor.id === target.id && SELF_MESSAGE[op]) return SELF_MESSAGE[op]!;
  if (target.isSuperAdmin && !actor.isSuperAdmin) return "Only a Super Admin can change a Super Admin's account.";
  if (op === "role" && ctx.newRoleIsSuperAdmin && !actor.isSuperAdmin) return "Only a Super Admin can give someone the Super Admin role.";
  const removesSuperAdmin = target.isSuperAdmin && target.isActive && (op === "disable" || (op === "role" && !ctx.newRoleIsSuperAdmin));
  if (removesSuperAdmin && ctx.activeSuperAdmins <= 1) return "There must always be at least one active Super Admin.";
  return null;
}

// ---- Activity labels ------------------------------------------------------------

export const ACTIVITY_LABEL: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  LOGIN_FAILED: "Failed sign-in",
  LOCKED: "Locked out after failed attempts",
  PASSWORD_CHANGE: "Changed their password",
  ROLE_CREATE: "Created a role",
  ROLE_UPDATE: "Edited a role",
  ROLE_DELETE: "Deleted a role",
  USER_ROLE: "Role changed",
  USER_DISABLE: "Sign-in disabled",
  USER_ENABLE: "Sign-in enabled",
  USER_UNLOCK: "Account unlocked",
  PASSWORD_RESET_BY_ADMIN: "Password reset by an admin",
  SIGN_OUT_EVERYWHERE: "Signed out everywhere",
};

export const SIGN_IN_ACTIONS = ["LOGIN", "LOGOUT", "LOGIN_FAILED", "LOCKED"] as const;

/** Readable one-liner for an audit entry: "Signed in", or "Update · Employee #12" for anything not listed. */
export function activityLabel(action: string, entity: string, entityId: string | null): string {
  const known = ACTIVITY_LABEL[action];
  if (known) return known;
  const verb = action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, " ");
  return `${verb} · ${entity}${entityId ? ` #${entityId}` : ""}`;
}
