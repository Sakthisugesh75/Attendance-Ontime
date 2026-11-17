import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, type Permission } from "@/lib/access/permissions";
import {
  activityLabel,
  diffPermissions,
  grantError,
  isOnline,
  parseAccessParams,
  roleDeleteError,
  roleEditError,
  roleSchema,
  roleSummary,
  signInStatus,
  timeAgo,
  userActionError,
  type GuardActor,
} from "@/lib/validations/access";

const owner: GuardActor = { id: 1, isSuperAdmin: true, permissions: PERMISSION_KEYS, scope: "ALL" };
const manager: GuardActor = { id: 2, isSuperAdmin: false, permissions: ["access.manage", "employees.view", "reports.view"], scope: "TEAM" };

const sa = (id: number, isActive = true) => ({ id, isSuperAdmin: true, isActive });
const staff = (id: number, isActive = true) => ({ id, isSuperAdmin: false, isActive });

describe("userActionError: self", () => {
  it("blocks changing your own role, disabling or signing yourself out", () => {
    expect(userActionError(owner, sa(1), "role", { activeSuperAdmins: 3 })).toMatch(/own role/);
    expect(userActionError(owner, sa(1), "disable", { activeSuperAdmins: 3 })).toMatch(/own sign-in/);
    expect(userActionError(owner, sa(1), "signout", { activeSuperAdmins: 3 })).toMatch(/yourself/);
    expect(userActionError(manager, staff(2), "role", { activeSuperAdmins: 1 })).toMatch(/own role/);
  });

  it("allows unlocking yourself (harmless)", () => {
    expect(userActionError(owner, sa(1), "unlock", { activeSuperAdmins: 1 })).toBeNull();
  });
});

describe("userActionError: Super Admin accounts", () => {
  it("only a Super Admin may act on a Super Admin account", () => {
    for (const op of ["role", "disable", "enable", "unlock", "reset", "signout"] as const) {
      expect(userActionError(manager, sa(9), op, { activeSuperAdmins: 2 })).toMatch(/Only a Super Admin/);
    }
    expect(userActionError(owner, sa(9), "reset", { activeSuperAdmins: 2 })).toBeNull();
  });

  it("only a Super Admin may give the Super Admin role", () => {
    expect(userActionError(manager, staff(5), "role", { activeSuperAdmins: 1, newRoleIsSuperAdmin: true })).toMatch(/Super Admin role/);
    expect(userActionError(owner, staff(5), "role", { activeSuperAdmins: 1, newRoleIsSuperAdmin: true })).toBeNull();
    expect(userActionError(manager, staff(5), "role", { activeSuperAdmins: 1, newRoleIsSuperAdmin: false })).toBeNull();
  });
});

describe("userActionError: at least one active Super Admin", () => {
  it("refuses to disable or demote the last active Super Admin", () => {
    expect(userActionError(owner, sa(9), "disable", { activeSuperAdmins: 1 })).toMatch(/at least one active Super Admin/);
    expect(userActionError(owner, sa(9), "role", { activeSuperAdmins: 1, newRoleIsSuperAdmin: false })).toMatch(/at least one active Super Admin/);
  });

  it("allows it when another active Super Admin remains", () => {
    expect(userActionError(owner, sa(9), "disable", { activeSuperAdmins: 2 })).toBeNull();
    expect(userActionError(owner, sa(9), "role", { activeSuperAdmins: 2, newRoleIsSuperAdmin: false })).toBeNull();
  });

  it("doesn't count an already-disabled Super Admin against the rule", () => {
    expect(userActionError(owner, sa(9, false), "role", { activeSuperAdmins: 1, newRoleIsSuperAdmin: false })).toBeNull();
    expect(userActionError(owner, sa(9, false), "enable", { activeSuperAdmins: 1 })).toBeNull();
  });

  it("keeping someone a Super Admin is not a demotion", () => {
    expect(userActionError(owner, sa(9), "role", { activeSuperAdmins: 1, newRoleIsSuperAdmin: true })).toBeNull();
  });

  it("other actions on the last Super Admin are fine", () => {
    for (const op of ["unlock", "reset", "signout"] as const) expect(userActionError(owner, sa(9), op, { activeSuperAdmins: 1 })).toBeNull();
  });
});

describe("grantError", () => {
  it("lets a Super Admin grant anything", () => {
    expect(grantError(owner, PERMISSION_KEYS, "ALL")).toBeNull();
  });

  it("limits others to permissions they hold and to their own reach", () => {
    expect(grantError(manager, ["employees.view"], "SELF")).toBeNull();
    expect(grantError(manager, ["employees.view", "reports.view"], "TEAM")).toBeNull();
    expect(grantError(manager, ["settings.manage"], "SELF")).toMatch(/Company settings/);
    expect(grantError(manager, ["employees.view"], "ALL")).toMatch(/wider reach/);
  });
});

describe("roleEditError / roleDeleteError", () => {
  it("keeps Super Admin read-only and built-in names fixed", () => {
    expect(roleEditError({ systemKey: "SUPER_ADMIN", name: "Super Admin" }, { name: "Super Admin" })).toMatch(/can't be changed/);
    expect(roleEditError({ systemKey: "HR", name: "HR / Manager" }, { name: "People Ops" })).toMatch(/renamed/);
    expect(roleEditError({ systemKey: "HR", name: "HR / Manager" }, { name: " HR / Manager " })).toBeNull();
    expect(roleEditError({ systemKey: null, name: "Team Lead" }, { name: "Squad Lead" })).toBeNull();
  });

  it("deletes only unused custom roles, or moves people first", () => {
    const actor = { isSuperAdmin: false };
    expect(roleDeleteError({ id: 1, systemKey: "EMPLOYEE", userCount: 0 }, null, actor)).toMatch(/Built-in/);
    expect(roleDeleteError({ id: 7, systemKey: null, userCount: 0 }, null, actor)).toBeNull();
    expect(roleDeleteError({ id: 7, systemKey: null, userCount: 2 }, null, actor)).toMatch(/2 people have this role/);
    expect(roleDeleteError({ id: 7, systemKey: null, userCount: 1 }, { id: 7, systemKey: null }, actor)).toMatch(/different role/);
    expect(roleDeleteError({ id: 7, systemKey: null, userCount: 1 }, { id: 3, systemKey: "EMPLOYEE" }, actor)).toBeNull();
    expect(roleDeleteError({ id: 7, systemKey: null, userCount: 1 }, { id: 1, systemKey: "SUPER_ADMIN" }, actor)).toMatch(/Only a Super Admin/);
    expect(roleDeleteError({ id: 7, systemKey: null, userCount: 1 }, { id: 1, systemKey: "SUPER_ADMIN" }, { isSuperAdmin: true })).toBeNull();
  });
});

describe("diffPermissions / roleSummary", () => {
  it("lists added and removed keys in catalogue order", () => {
    const before: Permission[] = ["reports.view", "employees.view"];
    const after: Permission[] = ["reports.export", "employees.view", "dashboard.org"];
    expect(diffPermissions(before, after)).toEqual({ added: ["dashboard.org", "reports.export"], removed: ["reports.view"] });
    expect(diffPermissions(after, after)).toEqual({ added: [], removed: [] });
  });

  it("summarises what a role can do and reach", () => {
    expect(roleSummary(["reports.view", "employees.view"], "TEAM")).toBe("Can: View employees, View reports · Reaches: Own team");
    expect(roleSummary([], "SELF")).toBe("Can: only their own attendance and requests · Reaches: Only themselves");
  });
});

describe("roleSchema", () => {
  it("accepts a valid role and rejects unknown permissions", () => {
    expect(roleSchema.safeParse({ name: "Team Lead", description: "", scope: "TEAM", permissions: ["attendance.view"], dailyReports: true }).success).toBe(true);
    expect(roleSchema.safeParse({ name: "Team Lead", description: "", scope: "TEAM", permissions: [] }).success).toBe(false); // the daily-report switch is required
    expect(roleSchema.safeParse({ name: "Team Lead", description: "", scope: "TEAM", permissions: ["root.everything"], dailyReports: true }).success).toBe(false);
    expect(roleSchema.safeParse({ name: " x ", description: "", scope: "TEAM", permissions: [], dailyReports: true }).success).toBe(false);
  });
});

describe("sign-in status and presence", () => {
  const now = new Date("2026-11-04T06:00:00Z");
  const base = { isActive: true, lockedUntil: null, mustChangePassword: false, lastLoginAt: new Date("2026-11-01T04:00:00Z") };

  it("ranks disabled > locked > waiting for first sign-in > active", () => {
    expect(signInStatus(base, now)).toBe("ACTIVE");
    expect(signInStatus({ ...base, mustChangePassword: true, lastLoginAt: null }, now)).toBe("PENDING");
    expect(signInStatus({ ...base, mustChangePassword: true }, now)).toBe("ACTIVE");
    expect(signInStatus({ ...base, lockedUntil: new Date("2026-11-04T06:10:00Z") }, now)).toBe("LOCKED");
    expect(signInStatus({ ...base, lockedUntil: new Date("2026-11-04T05:50:00Z") }, now)).toBe("ACTIVE");
    expect(signInStatus({ ...base, isActive: false, lockedUntil: new Date("2026-11-04T06:10:00Z") }, now)).toBe("DISABLED");
  });

  it("treats the last 5 minutes as online", () => {
    expect(isOnline(new Date("2026-11-04T05:56:00Z"), now)).toBe(true);
    expect(isOnline(new Date("2026-11-04T05:54:59Z"), now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
  });

  it("formats time ago", () => {
    expect(timeAgo(null, now)).toBeNull();
    expect(timeAgo(new Date("2026-11-04T05:59:30Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-11-04T05:48:00Z"), now)).toBe("12 min ago");
    expect(timeAgo(new Date("2026-11-04T03:00:00Z"), now)).toBe("3 h ago");
    expect(timeAgo(new Date("2026-11-03T05:00:00Z"), now)).toBe("yesterday");
    expect(timeAgo(new Date("2026-10-30T06:00:00Z"), now)).toBe("5 days ago");
  });
});

describe("parseAccessParams / activityLabel", () => {
  it("falls back to safe defaults", () => {
    expect(parseAccessParams({ tab: "nope", status: "weird", role: "x", page: "-3" })).toEqual({ tab: "roles", q: "", role: undefined, status: undefined, page: 1 });
    expect(parseAccessParams({ tab: "users", status: "locked", role: "4", q: " meena " })).toMatchObject({ tab: "users", status: "locked", role: 4, q: "meena" });
  });

  it("labels known and unknown actions", () => {
    expect(activityLabel("LOGIN", "User", "3")).toBe("Signed in");
    expect(activityLabel("UPDATE", "Employee", "12")).toBe("Update · Employee #12");
  });
});
