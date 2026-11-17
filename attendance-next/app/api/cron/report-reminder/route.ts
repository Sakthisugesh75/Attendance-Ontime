import { NextResponse, type NextRequest } from "next/server";
import { verifyCron } from "@/lib/cron";
import { punchedInWithoutReport } from "@/lib/daily-reports";
import { notifyUsers } from "@/lib/notifications";
import { istDate } from "@/lib/time";

/**
 * Evening nudge (schedule for about 6:30 PM IST): everyone who punched in today but hasn't
 * sent their daily report gets one bell notification + email. People on leave, off or not
 * punched in are left alone.
 */
export async function GET(req: NextRequest) {
  const denied = verifyCron(req);
  if (denied) return denied;

  const date = istDate();
  const people = await punchedInWithoutReport(date);
  await notifyUsers(
    people.map((p) => p.userId!),
    {
      title: "Don't forget today's report",
      body: "Before you leave: what you worked on, tomorrow's plan and anything blocking you. It takes a minute.",
      link: "/daily-reports?view=mine",
      popup: true,
    },
  );

  return NextResponse.json({ date, reminded: people.map((p) => ({ id: p.id, name: p.fullName })) });
}

export const POST = GET;
