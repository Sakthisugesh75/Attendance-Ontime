import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canReachEmployee, hasPermission, routeUser } from "@/lib/session";

const STORAGE = path.join(process.cwd(), "storage");
const TYPES: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png" };

/** An expense receipt: for the employee who claimed it, their reporting manager, and expenses.manage in reach. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await routeUser();
  if ("status" in res) return new NextResponse("Unauthorized", { status: res.status });
  const { user } = res;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Not found", { status: 404 });

  const claim = await prisma.expenseClaim.findUnique({ where: { id }, select: { employeeId: true, receiptPath: true, employee: { select: { managerId: true } } } });
  if (!claim?.receiptPath) return new NextResponse("Not found", { status: 404 });
  const allowed =
    claim.employeeId === user.employeeId ||
    (!!user.employeeId && claim.employee.managerId === user.employeeId) ||
    (hasPermission(user, "expenses.manage") && (await canReachEmployee(user, claim.employeeId)));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const abs = path.resolve(STORAGE, claim.receiptPath);
  if (!abs.startsWith(path.join(STORAGE, "receipts") + path.sep)) return new NextResponse("Not found", { status: 404 });
  const ext = path.extname(abs).toLowerCase();
  const type = TYPES[ext];
  if (!type) return new NextResponse("Not found", { status: 404 });
  try {
    const body = await readFile(abs);
    return new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="expense-${id}-receipt${ext}"`,
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
