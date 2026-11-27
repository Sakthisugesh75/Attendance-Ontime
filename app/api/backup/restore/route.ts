import { NextResponse, type NextRequest } from "next/server";
import { BackupError, parseBackup, readStoredBackup, restoreBackup, saveBackup } from "@/lib/backup";
import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routeUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_UPLOAD = 200 * 1024 * 1024;

/**
 * Replaces the whole database with a backup (an uploaded file, or `stored` = a copy kept on the
 * server). Super Admin only, and the form must send confirm=RESTORE. A safety copy of the
 * current data is saved first, so a wrong restore can itself be undone.
 */
export async function POST(req: NextRequest) {
  const res = await routeUser("settings.manage");
  if ("status" in res) return NextResponse.json({ error: res.status === 401 ? "Sign in first." : "Forbidden" }, { status: res.status });
  if (!res.user.isSuperAdmin || (await auth())?.user?.mustChangePassword) return NextResponse.json({ error: "Only a Super Admin can restore a backup." }, { status: 403 });

  try {
    const form = await req.formData();
    if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "RESTORE") return NextResponse.json({ error: "Type RESTORE to confirm." }, { status: 400 });

    const stored = form.get("stored");
    const upload = form.get("file");
    let raw: Buffer;
    let source: string;
    if (typeof stored === "string" && stored) {
      raw = await readStoredBackup(stored);
      source = stored;
    } else if (upload instanceof File && upload.size > 0) {
      if (upload.size > MAX_UPLOAD) return NextResponse.json({ error: "The backup is larger than 200 MB." }, { status: 400 });
      raw = Buffer.from(await upload.arrayBuffer());
      source = upload.name;
    } else {
      return NextResponse.json({ error: "Choose a backup file." }, { status: 400 });
    }

    const file = await parseBackup(raw);
    const safety = await saveBackup("pre-restore");
    const counts = await restoreBackup(file);

    // The restored data has its own audit log; record the restore in it (actor only if they still exist).
    const actorStillThere = await prisma.user.findUnique({ where: { id: res.user.id }, select: { id: true } });
    await writeAudit({
      actorId: actorStillThere ? res.user.id : null,
      action: "RESTORE",
      entity: "Backup",
      entityId: source.slice(0, 50),
      after: { backupCreatedAt: file.createdAt, safetyCopy: safety, employees: counts.Employee ?? 0, attendanceRecords: counts.AttendanceRecord ?? 0 },
      reason: actorStillThere ? null : `Restored by ${res.user.name} (${res.user.email || `user ${res.user.id}`}), who isn't in the restored data`,
    });
    return NextResponse.json({ ok: true, backupCreatedAt: file.createdAt, safetyCopy: safety, counts });
  } catch (err) {
    if (err instanceof BackupError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("restore failed", err);
    return NextResponse.json({ error: "The restore failed and nothing was changed. Check the server log." }, { status: 500 });
  }
}
