"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionUser } from "@/lib/session";

export async function markNotificationRead(id: number) {
  const user = await actionUser();
  const parsed = z.number().int().positive().parse(id);
  // Scoped to the caller so nobody can mark someone else's notifications.
  await prisma.notification.updateMany({ where: { id: parsed, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const user = await actionUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
