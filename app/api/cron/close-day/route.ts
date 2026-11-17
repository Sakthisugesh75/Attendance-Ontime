import { NextResponse, type NextRequest } from "next/server";
import { closeDay } from "@/lib/attendance/service";
import { verifyCron } from "@/lib/cron";
import { notifyMissingPunchOut } from "@/lib/notifications";
import { istDate } from "@/lib/time";

/**
 * End of day (schedule for 11:59 PM IST): stores final statuses — absent, holiday, weekly off —
 * for everyone employed today and flags open punches as MISSING_PUNCH_OUT, notifying the
 * employee and HR. `?date=YYYY-MM-DD` re-runs a past day.
 */
export async function GET(req: NextRequest) {
  const denied = verifyCron(req);
  if (denied) return denied;

  const date = req.nextUrl.searchParams.get("date") ?? istDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const result = await closeDay(date);
  await notifyMissingPunchOut(date, result.missingPunchOut);
  return NextResponse.json({ date, ...result });
}

export const POST = GET;
