import "server-only";
import { routeUser, scopeEmployeeIds } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { formatDate, formatTime, istDate } from "@/lib/time";
import type { ExportHeader } from "./xlsx";

/**
 * Route-handler guard for downloads: needs reports.export. Returns the employees the caller
 * reaches (null = everyone) so the file only covers them, or a 401/403 response.
 */
export async function exportGuard(): Promise<{ reach: number[] | null } | { denied: Response }> {
  const res = await routeUser("reports.export");
  if ("status" in res) {
    return { denied: new Response(res.status === 401 ? "Your session has ended. Sign in again." : "You don't have permission to do that.", { status: res.status }) };
  }
  return { reach: await scopeEmployeeIds(res.user) };
}

export async function exportHeader(title: string, from: string, to: string, now = new Date()): Promise<ExportHeader> {
  const company = await getSetting("company");
  return {
    company: company.name,
    title,
    period: from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`,
    generatedAt: `${formatDate(istDate(now))}, ${formatTime(now)} IST`,
  };
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function fileResponse(body: ArrayBuffer | Uint8Array | Buffer, type: string, filename: string): Response {
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
