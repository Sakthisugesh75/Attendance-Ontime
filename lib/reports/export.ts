import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { routeUser, scopeEmployeeIds } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { formatDate, formatTime, istDate } from "@/lib/time";
import type { ReportColumn } from "./types";
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

/** The company logo as bytes for Excel / PDF (PNG or JPG only; other formats are skipped). */
async function logoBytes(logoPath: string | null): Promise<ExportHeader["logo"]> {
  if (!logoPath) return null;
  const ext = path.extname(logoPath).toLowerCase();
  const format = ext === ".png" ? "png" : ext === ".jpg" || ext === ".jpeg" ? "jpeg" : null;
  if (!format) return null;
  const storage = path.join(process.cwd(), "storage");
  const abs = path.resolve(storage, logoPath);
  if (!abs.startsWith(storage + path.sep)) return null;
  try {
    return { data: await readFile(abs), format };
  } catch {
    return null;
  }
}

/**
 * Title block for an export, with the letterhead from Settings → Export format.
 * `reportKey` picks the columns hidden for that report (see `visibleColumns`).
 */
export async function exportHeader(title: string, from: string, to: string, now = new Date()): Promise<ExportHeader> {
  const { company, exportFormat: f } = await getSettings("company", "exportFormat");
  return {
    company: company.name,
    title,
    period: from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`,
    generatedAt: `${formatDate(istDate(now))}, ${formatTime(now)} IST`,
    address: f.showAddress && company.address ? company.address : null,
    logo: f.showLogo ? await logoBytes(company.logoPath) : null,
    headerNote: f.headerNote || null,
    footerNote: f.footerNote || null,
    signatures: f.signatures,
    orientation: f.pdfOrientation,
  };
}

/** Columns for an export, without the ones hidden for this report (the first column always stays). */
export async function visibleColumns(reportKey: string, columns: ReportColumn[]): Promise<ReportColumn[]> {
  const hidden = new Set((await getSettings("exportFormat")).exportFormat.hiddenColumns[reportKey] ?? []);
  return columns.filter((c, i) => i === 0 || !hidden.has(c.key));
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
