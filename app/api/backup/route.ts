import { NextResponse, type NextRequest } from "next/server";
import { BackupError, createBackup, readStoredBackup } from "@/lib/backup";
import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { routeUser } from "@/lib/session";
import { istDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Downloads a backup. Super Admin only: it holds every record, including password hashes.
 * Without `?file=` a fresh backup is made; with it, a copy kept on the server is sent.
 */
export async function GET(req: NextRequest) {
  const res = await routeUser("settings.manage");
  if ("status" in res) return NextResponse.json({ error: res.status === 401 ? "Sign in first." : "Forbidden" }, { status: res.status });
  if (!res.user.isSuperAdmin || (await auth())?.user?.mustChangePassword) return NextResponse.json({ error: "Only a Super Admin can download backups." }, { status: 403 });

  const file = req.nextUrl.searchParams.get("file");
  let body: Buffer;
  let name: string;
  try {
    if (file) {
      body = await readStoredBackup(file);
      name = file;
    } else {
      body = (await createBackup()).buffer;
      name = `attendance-backup-${istDate()}.json.gz`;
    }
  } catch (err) {
    if (err instanceof BackupError || (err as { code?: string })?.code === "ENOENT") return NextResponse.json({ error: "That backup doesn't exist." }, { status: 404 });
    throw err;
  }
  await writeAudit({ actorId: res.user.id, action: "BACKUP_DOWNLOAD", entity: "Backup", entityId: file ?? null, after: { bytes: body.length } });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
