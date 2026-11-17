import { NextResponse, type NextRequest } from "next/server";
import { teamToday } from "@/lib/attendance/dashboard";
import { verifyCron } from "@/lib/cron";
import { recipientsForMany } from "@/lib/access/recipients";
import { nameList, notifyUsers } from "@/lib/notifications";
import { formatDate } from "@/lib/time";

/**
 * Morning check (schedule for 10:30 AM IST): who is expected today but hasn't punched in.
 * Holidays, weekly offs and approved leave / WFH / on duty are already excluded by the
 * attendance rules (they get their own status). Every user who can view attendance gets one
 * bell notification + email naming only the people in their reach; nothing is sent when
 * everyone (in their reach) is in.
 */
export async function GET(req: NextRequest) {
  const denied = verifyCron(req);
  if (denied) return denied;

  const team = await teamToday();
  const missing = team.notIn;
  const expected = team.total - team.off.length - team.leave.length - team.wfh.length;

  let notified = 0;
  if (missing.length) {
    const names = new Map(missing.map((p) => [p.id, p.name]));
    const recipients = await recipientsForMany("attendance.view", [...names.keys()]);
    for (const [userId, ids] of recipients) {
      await notifyUsers([userId], {
        title: `${ids.length} ${ids.length === 1 ? "person hasn't" : "people haven't"} punched in · ${formatDate(team.date)}`,
        body: `Not punched in yet: ${nameList(ids.map((id) => names.get(id)!))}.`,
        link: "/dashboard",
      });
    }
    notified = recipients.size;
  }

  return NextResponse.json({
    date: team.date,
    expected,
    punchedIn: team.present.length,
    notPunchedIn: missing.map((p) => ({ id: p.id, code: p.code, name: p.name })),
    notified,
  });
}

export const POST = GET;
