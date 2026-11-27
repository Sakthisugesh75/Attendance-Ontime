/**
 * The permission catalogue: every capability the Super Admin can grant through a role.
 * Pure (no server imports) so the role editor, navigation and tests can use it too.
 *
 * Everyone signed in can always: see their own dashboard, punch in/out, see their own
 * attendance, raise their own requests, see holidays and their notifications.
 */

export const PERMISSIONS = {
  "dashboard.org": { group: "Attendance", label: "Organisation dashboard", hint: "Team-wide charts, today at a glance and things needing attention" },
  "attendance.view": { group: "Attendance", label: "View others' attendance", hint: "Attendance history and the muster roll for people in reach" },
  "attendance.edit": { group: "Attendance", label: "Edit attendance", hint: "Correct days on the muster roll and bulk-mark dates (a reason is always required)" },
  "requests.approve": { group: "Requests", label: "Approve requests", hint: "Approve or reject leave, WFH, permission, on-duty and corrections" },
  "dailyreports.review": { group: "Requests", label: "Review daily reports", hint: "Read and acknowledge the daily work reports of people in reach; see who hasn't sent one" },
  "employees.view": { group: "People", label: "View employees", hint: "Employee list and profiles" },
  "employees.manage": { group: "People", label: "Manage employees", hint: "Add, edit and remove employees; reset their passwords; give sign-in" },
  "holidays.manage": { group: "People", label: "Manage holidays", hint: "Add, edit and remove holidays" },
  "announcements.manage": { group: "People", label: "Post announcements", hint: "Post, pin and remove company announcements shown on everyone's dashboard" },
  "expenses.manage": { group: "Finance & assets", label: "Manage expenses", hint: "Final approval of expense claims, mark them paid, set categories and limits (managers approve their own team's claims without this)" },
  "assets.manage": { group: "Finance & assets", label: "Manage assets", hint: "Add company assets, hand them out, take them back and track repairs" },
  "reports.view": { group: "Reports & data", label: "View reports", hint: "Monthly summary, late, leave, overtime, hours, WFH and payroll reports" },
  "reports.export": { group: "Reports & data", label: "Export reports", hint: "Download reports and the muster as Excel or PDF" },
  "import.run": { group: "Reports & data", label: "Import Excel", hint: "Upload old attendance logs and undo imports" },
  "settings.manage": { group: "Administration", label: "Company settings", hint: "Company profile, shifts, weekly offs, leave types, policies, punching rules" },
  "audit.view": { group: "Administration", label: "Activity & audit log", hint: "Every change and sign-in, with who, when and why" },
  "access.manage": { group: "Administration", label: "Manage access", hint: "Create roles, assign them, disable sign-in and sign people out" },
} as const satisfies Record<string, { group: string; label: string; hint: string }>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];
export const PERMISSION_GROUPS = [...new Set(Object.values(PERMISSIONS).map((p) => p.group))];

export type Scope = "ALL" | "TEAM" | "SELF";
export const SCOPE_LABEL: Record<Scope, { label: string; hint: string }> = {
  ALL: { label: "Everyone", hint: "All employees in the company" },
  TEAM: { label: "Own team", hint: "Themselves and the people who report to them (directly or through others)" },
  SELF: { label: "Only themselves", hint: "Just their own records" },
};

/** Permissions of the built-in roles, as created by the migration and seed. */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: { name: "Super Admin", description: "Owner account: every permission, everyone's data", scope: "ALL" as Scope, permissions: PERMISSION_KEYS },
  HR: {
    name: "HR / Manager",
    description: "Runs day-to-day attendance for the whole company",
    scope: "ALL" as Scope,
    permissions: [
      "dashboard.org",
      "attendance.view",
      "attendance.edit",
      "requests.approve",
      "dailyreports.review",
      "employees.view",
      "employees.manage",
      "holidays.manage",
      "announcements.manage",
      "expenses.manage",
      "assets.manage",
      "reports.view",
      "reports.export",
      "import.run",
    ] as Permission[],
  },
  EMPLOYEE: { name: "Employee", description: "Own attendance and requests only", scope: "SELF" as Scope, permissions: [] as Permission[] },
} as const;

/** What a signed-in user may do. Built per request on the server; mirrored in the session for navigation. */
export interface Access {
  isSuperAdmin: boolean;
  permissions: Permission[];
  scope: Scope;
  roleName: string;
}

/** Super Admins can do everything; everyone else needs the permission in their role. */
export function can(access: Pick<Access, "isSuperAdmin" | "permissions">, permission: Permission): boolean {
  return access.isSuperAdmin || access.permissions.includes(permission);
}

/** True if the user has at least one of the permissions. */
export function canAny(access: Pick<Access, "isSuperAdmin" | "permissions">, ...permissions: Permission[]): boolean {
  return permissions.some((p) => can(access, p));
}

/** Keeps only known keys (roles are stored as JSON, so never trust their contents blindly). */
export function cleanPermissions(value: unknown): Permission[] {
  return Array.isArray(value) ? PERMISSION_KEYS.filter((k) => value.includes(k)) : [];
}

/** Access for a user row (with its role). Super Admins always get everything. */
export function accessOf(user: { role: string; accessRole: { name: string; permissions: unknown; scope: Scope } | null }): Access {
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  return {
    isSuperAdmin,
    permissions: isSuperAdmin ? PERMISSION_KEYS : cleanPermissions(user.accessRole?.permissions),
    scope: isSuperAdmin ? "ALL" : (user.accessRole?.scope ?? "SELF"),
    roleName: isSuperAdmin ? "Super Admin" : (user.accessRole?.name ?? "Employee"),
  };
}
