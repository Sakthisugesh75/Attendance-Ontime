/**
 * Pure helpers for the audit-log screen and its CSV export: URL filter parsing, the
 * field-level before/after diff and CSV escaping. No server or DOM dependencies (unit-tested).
 */
import { z } from "zod";

export const AUDIT_PAGE_SIZE = 50;

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

/** Filters as they appear in the URL. Unknown or malformed values are dropped, never thrown. */
export const auditParamsSchema = z.object({
  from: ymd,
  to: ymd,
  /** A user id, or "system" for entries without an actor */
  actor: z
    .string()
    .regex(/^(\d{1,9}|system)$/)
    .optional()
    .catch(undefined),
  entity: z.string().trim().max(50).optional().catch(undefined),
  action: z.string().trim().max(50).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100_000).catch(1).default(1),
});

export type AuditParams = z.infer<typeof auditParamsSchema>;

export function parseAuditParams(raw: Record<string, string | string[] | undefined>): AuditParams {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) || undefined]));
  const p = auditParamsSchema.parse(flat);
  // A reversed range is almost always a slip: swap rather than return nothing.
  if (p.from && p.to && p.from > p.to) [p.from, p.to] = [p.to, p.from];
  return p;
}

/** Same filters as a query string (page excluded), for the export link. */
export function auditQueryString(p: AuditParams, extra: Record<string, string | number | undefined> = {}): string {
  const s = new URLSearchParams();
  for (const k of ["from", "to", "actor", "entity", "action", "q"] as const) if (p[k]) s.set(k, String(p[k]));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") s.set(k, String(v));
  return s.toString();
}

// ---- Diff ---------------------------------------------------------------------

export type ChangeKind = "added" | "removed" | "changed" | "same";

export interface DiffRow {
  key: string;
  /** Display text; null when the key is absent on that side */
  before: string | null;
  after: string | null;
  kind: ChangeKind;
  /** True when either side is a nested object/array rendered as multi-line JSON */
  multiline: boolean;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Structural equality for JSON values (key order ignored). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEqual(a[k], b[k]));
  }
  return false;
}

/** A JSON value as display text: strings bare, nested values pretty-printed. */
export function formatJsonValue(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

/**
 * Field-level diff of an audit entry. Objects are compared key by key (keys in their
 * original order, new keys last); anything else is compared as one "(value)" row.
 */
export function diffAudit(before: unknown, after: unknown): DiffRow[] {
  const b = before ?? undefined;
  const a = after ?? undefined;
  if (b === undefined && a === undefined) return [];

  if ((b === undefined || isPlainObject(b)) && (a === undefined || isPlainObject(a))) {
    const bo = (b ?? {}) as Record<string, unknown>;
    const ao = (a ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(bo), ...Object.keys(ao)])];
    return keys.map((key) => row(key, key in bo ? bo[key] : undefined, key in ao ? ao[key] : undefined, key in bo, key in ao));
  }
  return [row("(value)", b, a, b !== undefined, a !== undefined)];
}

function row(key: string, bv: unknown, av: unknown, hasB: boolean, hasA: boolean): DiffRow {
  const kind: ChangeKind = !hasB ? "added" : !hasA ? "removed" : jsonEqual(bv, av) ? "same" : "changed";
  return {
    key,
    before: hasB ? formatJsonValue(bv) : null,
    after: hasA ? formatJsonValue(av) : null,
    kind,
    multiline: (typeof bv === "object" && bv !== null) || (typeof av === "object" && av !== null),
  };
}

export const changedCount = (rows: DiffRow[]) => rows.filter((r) => r.kind !== "same").length;

// ---- CSV ----------------------------------------------------------------------

/**
 * One CSV cell (RFC 4180). Cells that a spreadsheet would treat as a formula
 * (= + - @, tab, CR) get a leading apostrophe so an exported log can't run code in Excel.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with CRLF line ends (what Excel expects). */
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
