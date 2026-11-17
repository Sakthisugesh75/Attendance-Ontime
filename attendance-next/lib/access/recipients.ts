import "server-only";
import { accessOf, can, type Permission } from "@/lib/access/permissions";
import { inReach, reachIds } from "@/lib/access/team";
import { prisma } from "@/lib/prisma";

/** An active user holding a permission, with the employees their role reaches (null = everyone). */
export interface Holder {
  userId: number;
  reach: number[] | null;
}

/** Every active user who holds `permission`, with their reach. */
export async function permissionHolders(permission: Permission): Promise<Holder[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, role: true, accessRole: { select: { name: true, permissions: true, scope: true } }, employee: { select: { id: true, deletedAt: true } } },
  });
  const holders = users.map((u) => ({ u, access: accessOf(u) })).filter((x) => can(x.access, permission));
  if (!holders.length) return [];
  const needsLinks = holders.some((x) => !x.access.isSuperAdmin && x.access.scope === "TEAM");
  const links = needsLinks ? await prisma.employee.findMany({ where: { deletedAt: null }, select: { id: true, managerId: true } }) : [];
  return holders.map(({ u, access }) => {
    const employeeId = u.employee && !u.employee.deletedAt ? u.employee.id : null;
    return { userId: u.id, reach: reachIds(access, employeeId, links) };
  });
}

/** Active users who hold `permission` AND whose reach includes the employee. */
export async function recipientsFor(permission: Permission, employeeId: number): Promise<number[]> {
  return (await permissionHolders(permission)).filter((h) => inReach(h.reach, employeeId)).map((h) => h.userId);
}

/**
 * For a message about several employees: each recipient (holding `permission`) with the
 * employees from `employeeIds` that they reach. Recipients reaching none are left out.
 */
export async function recipientsForMany(permission: Permission, employeeIds: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  for (const h of await permissionHolders(permission)) {
    const mine = employeeIds.filter((id) => inReach(h.reach, id));
    if (mine.length) out.set(h.userId, mine);
  }
  return out;
}
