"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { NavAccess } from "@/lib/palette";
import { actionUser, employeeScopeWhere } from "@/lib/session";

export interface EmployeeHit {
  id: number;
  name: string;
  code: string;
  detail: string | null;
}

const querySchema = z.string().trim().min(1).max(100);

/** Command palette: employees in reach by name, code or phone (needs employees.view). */
export async function searchEmployees(query: string): Promise<EmployeeHit[]> {
  const user = await actionUser("employees.view");
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return [];
  const q = parsed.data;
  const digits = q.replace(/\D/g, "");
  const rows = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      ...(await employeeScopeWhere(user)),
      OR: [
        { fullName: { contains: q } },
        { code: { contains: q } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits.slice(-10) } }] : []),
      ],
    },
    select: { id: true, fullName: true, code: true, status: true, designation: { select: { name: true } }, department: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    take: 8,
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.fullName,
    code: e.code,
    detail: [e.designation?.name, e.department?.name, e.status === "EXITED" ? "Exited" : null].filter(Boolean).join(" · ") || null,
  }));
}

/** The caller's permissions, for filtering palette pages when the layout didn't pass them. */
export async function currentAccess(): Promise<NavAccess> {
  const { isSuperAdmin, permissions } = await actionUser();
  return { isSuperAdmin, permissions };
}
