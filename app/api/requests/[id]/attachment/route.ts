import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canReachEmployee, hasPermission, routeUser } from "@/lib/session";

const STORAGE = path.join(process.cwd(), "storage");
const TYPES: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png" };

/** A leave request's attachment: visible to the employee who raised it and to approvers who reach them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await routeUser();
  if ("status" in res) return new NextResponse("Unauthorized", { status: res.status });
  const { user } = res;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Not found", { status: 404 });

  const request = await prisma.attendanceRequest.findUnique({ where: { id }, select: { employeeId: true, attachmentPath: true } });
  if (!request?.attachmentPath) return new NextResponse("Not found", { status: 404 });
  const own = request.employeeId === user.employeeId;
  if (!own && !(hasPermission(user, "requests.approve") && (await canReachEmployee(user, request.employeeId)))) return new NextResponse("Forbidden", { status: 403 });

  const abs = path.resolve(STORAGE, request.attachmentPath);
  if (!abs.startsWith(path.join(STORAGE, "attachments") + path.sep)) return new NextResponse("Not found", { status: 404 });
  const ext = path.extname(abs).toLowerCase();
  const type = TYPES[ext];
  if (!type) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await readFile(abs);
    return new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="request-${id}-attachment${ext}"`,
        "Cache-Control": "private, max-age=600",
        // Uploads are checked by content (PDF / JPG / PNG only), and the type is never sniffed.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
