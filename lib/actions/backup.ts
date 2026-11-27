"use server";

import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { BackupError, deleteStoredBackup, saveBackup } from "@/lib/backup";
import { actionUser, Forbidden } from "@/lib/session";

export type BackupResult = { ok: true; message: string } | { ok: false; error: string };

async function superAdmin() {
  const user = await actionUser("settings.manage");
  if (!user.isSuperAdmin) throw new Forbidden("Only a Super Admin can manage backups.");
  return user;
}

/** Saves a backup of the current data on the server. */
export async function saveBackupNow(): Promise<BackupResult> {
  try {
    const user = await superAdmin();
    const name = await saveBackup("manual");
    await writeAudit({ actorId: user.id, action: "BACKUP", entity: "Backup", entityId: name });
    revalidatePath("/settings");
    return { ok: true, message: "Backup saved on the server" };
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: err.message };
    console.error("saveBackupNow failed", err);
    return { ok: false, error: "Could not make the backup. Try again." };
  }
}

export async function deleteBackup(name: string): Promise<BackupResult> {
  try {
    const user = await superAdmin();
    await deleteStoredBackup(name);
    await writeAudit({ actorId: user.id, action: "DELETE", entity: "Backup", entityId: name });
    revalidatePath("/settings");
    return { ok: true, message: "Backup deleted" };
  } catch (err) {
    if (err instanceof Forbidden || err instanceof BackupError) return { ok: false, error: err.message };
    console.error("deleteBackup failed", err);
    return { ok: false, error: "Could not delete the backup." };
  }
}
