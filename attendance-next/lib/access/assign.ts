import "server-only";
import type { Prisma, Role } from "@prisma/client";

type Tx = Pick<Prisma.TransactionClient, "accessRole" | "user">;

/**
 * Gives a user an access role. The legacy `User.role` column is kept in step so the owner
 * flag stays correct: SUPER_ADMIN for the Super Admin role, HR for the built-in HR role,
 * EMPLOYEE for everything else. Callers check permissions and write the audit entry.
 */
export async function assignAccessRole(tx: Tx, userId: number, accessRoleId: number) {
  const role = await tx.accessRole.findUniqueOrThrow({ where: { id: accessRoleId } });
  const legacy: Role = role.systemKey === "SUPER_ADMIN" ? "SUPER_ADMIN" : role.systemKey === "HR" ? "HR" : "EMPLOYEE";
  return tx.user.update({ where: { id: userId }, data: { accessRoleId: role.id, role: legacy } });
}

/** The built-in role with this key (SUPER_ADMIN, HR or EMPLOYEE). */
export async function systemRole(tx: Pick<Prisma.TransactionClient, "accessRole">, key: "SUPER_ADMIN" | "HR" | "EMPLOYEE") {
  return tx.accessRole.findUniqueOrThrow({ where: { systemKey: key } });
}
