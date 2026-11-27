import { NextResponse, type NextRequest } from "next/server";
import { saveBackup } from "@/lib/backup";
import { verifyCron } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Nightly backup into storage/backups (the newest 14 daily copies are kept). */
export async function GET(req: NextRequest) {
  const denied = verifyCron(req);
  if (denied) return denied;
  const name = await saveBackup("daily");
  return NextResponse.json({ ok: true, name });
}
