import { describe, expect, it } from "vitest";
import { accessOf, can, canAny, PERMISSION_KEYS, SYSTEM_ROLES } from "@/lib/access/permissions";
import { inReach, reachIds, teamIds, type ManagerLink } from "@/lib/access/team";

// Lakshmi (1) leads Karthik (3), Meena (4), Praveen (5); Karthik leads Anitha (2) and Divya (6);
// Divya leads Ravi (7).
const LINKS: ManagerLink[] = [
  { id: 1, managerId: null },
  { id: 2, managerId: 3 },
  { id: 3, managerId: 1 },
  { id: 4, managerId: 1 },
  { id: 5, managerId: 1 },
  { id: 6, managerId: 3 },
  { id: 7, managerId: 6 },
];
const sorted = (ids: number[] | null) => (ids ? [...ids].sort((a, b) => a - b) : ids);

describe("teamIds", () => {
  it("includes the lead and everyone below them, directly or through others", () => {
    expect(sorted(teamIds(LINKS, 3))).toEqual([2, 3, 6, 7]);
    expect(sorted(teamIds(LINKS, 1))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("is just the person when nobody reports to them", () => {
    expect(teamIds(LINKS, 4)).toEqual([4]);
    expect(teamIds([], 9)).toEqual([9]);
  });

  it("survives cycles and self-references in the reporting lines", () => {
    const cyclic: ManagerLink[] = [
      { id: 1, managerId: 2 },
      { id: 2, managerId: 1 },
      { id: 3, managerId: 3 },
    ];
    expect(sorted(teamIds(cyclic, 1))).toEqual([1, 2]);
    expect(teamIds(cyclic, 3)).toEqual([3]);
  });
});

describe("reachIds", () => {
  const user = (scope: "ALL" | "TEAM" | "SELF", isSuperAdmin = false) => ({ scope, isSuperAdmin });

  it("is everyone (null) for scope ALL and for Super Admins whatever the scope", () => {
    expect(reachIds(user("ALL"), 3, LINKS)).toBeNull();
    expect(reachIds(user("SELF", true), 3, LINKS)).toBeNull();
    expect(reachIds(user("ALL"), null, LINKS)).toBeNull();
  });

  it("is the team for TEAM and only themselves for SELF", () => {
    expect(sorted(reachIds(user("TEAM"), 3, LINKS))).toEqual([2, 3, 6, 7]);
    expect(reachIds(user("SELF"), 3, LINKS)).toEqual([3]);
  });

  it("is nobody without an employee record (unless scope ALL)", () => {
    expect(reachIds(user("TEAM"), null, LINKS)).toEqual([]);
    expect(reachIds(user("SELF"), null, LINKS)).toEqual([]);
  });

  it("inReach treats null as everyone", () => {
    expect(inReach(null, 42)).toBe(true);
    expect(inReach([2, 3], 3)).toBe(true);
    expect(inReach([2, 3], 4)).toBe(false);
    expect(inReach([], 1)).toBe(false);
  });
});

describe("permissions", () => {
  const role = (r: { name: string; permissions: readonly string[]; scope: "ALL" | "TEAM" | "SELF" }) => ({ name: r.name, permissions: [...r.permissions], scope: r.scope });

  it("built-in roles keep today's behaviour", () => {
    const hr = accessOf({ role: "HR", accessRole: role(SYSTEM_ROLES.HR) });
    expect(hr.scope).toBe("ALL");
    expect(can(hr, "employees.manage")).toBe(true);
    expect(can(hr, "requests.approve")).toBe(true);
    expect(canAny(hr, "settings.manage", "audit.view", "access.manage")).toBe(false);

    const employee = accessOf({ role: "EMPLOYEE", accessRole: role(SYSTEM_ROLES.EMPLOYEE) });
    expect(employee.scope).toBe("SELF");
    expect(PERMISSION_KEYS.some((p) => can(employee, p))).toBe(false);

    const admin = accessOf({ role: "SUPER_ADMIN", accessRole: null });
    expect(admin.scope).toBe("ALL");
    expect(PERMISSION_KEYS.every((p) => can(admin, p))).toBe(true);
  });

  it("ignores unknown permission keys stored in a role", () => {
    const lead = accessOf({ role: "EMPLOYEE", accessRole: { name: "Team Lead", permissions: ["reports.view", "rm -rf", 7], scope: "TEAM" } });
    expect(lead.permissions).toEqual(["reports.view"]);
    expect(lead.scope).toBe("TEAM");
  });
});
