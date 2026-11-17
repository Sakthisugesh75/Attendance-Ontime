import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canReachEmployee, hasPermission, routeUser } from "@/lib/session";

const STORAGE = path.join(process.cwd(), "storage");
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/**
 * Serves stored uploads to signed-in users.
 * - photos/*  : any signed-in user (shown across the app)
 * - logos/*   : any signed-in user (company logo)
 * - selfies/* : the employee the selfie belongs to, or attendance.view with them in reach
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const res = await routeUser();
  if ("status" in res) return new NextResponse("Unauthorized", { status: res.status });
  const { user } = res;

  const parts = (await params).path;
  const rel = parts.join("/");
  const abs = path.resolve(STORAGE, rel);
  // No escaping the storage folder.
  if (!abs.startsWith(STORAGE + path.sep) || parts.some((p) => p === ".." || p.includes("\\"))) return new NextResponse("Not found", { status: 404 });

  const kind = parts[0];
  if (kind === "selfies") {
    const ownerId = Number(parts.at(-1)?.split("-")[0]);
    const own = Number.isInteger(ownerId) && ownerId === user.employeeId;
    const allowed = own || (Number.isInteger(ownerId) && ownerId > 0 && hasPermission(user, "attendance.view") && (await canReachEmployee(user, ownerId)));
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  } else if (kind === "logos") {
    // The company logo is shown to everyone signed in.
  } else if (kind === "photos") {
    const owner = await prisma.employee.findFirst({ where: { photoPath: rel }, select: { id: true } });
    if (!owner) return new NextResponse("Not found", { status: 404 });
  } else {
    return new NextResponse("Not found", { status: 404 });
  }

  const type = TYPES[path.extname(abs).toLowerCase()];
  if (!type) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await readFile(abs);
    return new NextResponse(body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
