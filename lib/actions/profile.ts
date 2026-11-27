"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden, hasPermission } from "@/lib/session";

export type ProfileResult = { ok: true; message: string } | { ok: false; error: string };

const nameSchema = z.string().trim().min(2, "Enter your name (at least 2 characters)").max(150, "Keep the name under 150 characters");

/**
 * Changes the signed-in person's display name. For a sign-in with an employee record the name
 * lives on the employee, which only people who can manage employees may change.
 */
export async function updateMyName(input: string): Promise<ProfileResult> {
  try {
    const actor = await actionUser();
    const parsed = nameSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const name = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: actor.id }, include: { employee: { select: { id: true, fullName: true, deletedAt: true } } } });
    if (!user) return { ok: false, error: "Your account no longer exists." };
    const employee = user.employee && !user.employee.deletedAt ? user.employee : null;
    if (employee && !hasPermission(actor, "employees.manage")) {
      return { ok: false, error: "Your name comes from your employee record. Ask HR to change it." };
    }
    const before = employee?.fullName || user.name;
    if (before === name) return { ok: true, message: "No changes" };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { name } });
      if (employee) await tx.employee.update({ where: { id: employee.id }, data: { fullName: name } });
      await writeAudit({ actorId: actor.id, action: "UPDATE", entity: "User", entityId: user.id, before: { name: before }, after: { name } }, tx);
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Name updated" };
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: err.message };
    console.error("updateMyName failed", err);
    return { ok: false, error: "Could not save your name. Try again." };
  }
}
