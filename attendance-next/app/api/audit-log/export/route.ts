import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_CSV_HEADER, exportAudit } from "@/components/audit/audit-query";
import { parseAuditParams, toCsv } from "@/components/audit/audit-utils";
import { writeAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { routeUser } from "@/lib/session";
import { istDate } from "@/lib/time";

/** CSV of the audit log for the current filters. Needs audit.view (middleware skips /api). */
export async function GET(req: NextRequest) {
  const res = await routeUser("audit.view");
  if ("status" in res) return NextResponse.json({ error: res.status === 401 ? "Sign in first." : "Forbidden" }, { status: res.status });
  // Someone who still has to change their password can't use anything else yet.
  if ((await auth())?.user?.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = parseAuditParams(Object.fromEntries(req.nextUrl.searchParams));
  const rows = await exportAudit(params);
  const filters = Object.fromEntries(Object.entries(params).filter(([k, v]) => k !== "page" && v !== undefined));
  await writeAudit({ actorId: res.user.id, action: "EXPORT", entity: "AuditLog", after: { rows: rows.length, filters } });

  // BOM so Excel opens UTF-8 (₹, Tamil names) correctly.
  const body = "﻿" + toCsv([AUDIT_CSV_HEADER, ...rows]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${istDate()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
