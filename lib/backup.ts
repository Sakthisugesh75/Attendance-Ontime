import "server-only";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * In-app database backup and restore.
 *
 * A backup is gzipped JSON holding every row of every Prisma model. It is built through Prisma
 * rather than mysqldump, so it works on any host (WAMP, Linux, cPanel) and is independent of
 * MySQL's table-name casing. Uploaded files (photos, selfies, attachments) are NOT included;
 * copy the `storage` folder for those.
 */

export const BACKUP_FORMAT = "attendance-desk-backup";
const VERSION = 1;
export const BACKUP_DIR = path.join(process.cwd(), "storage", "backups");
/** Server copies kept by the daily job (older ones are deleted). */
const KEEP_DAILY = 14;

type Model = (typeof Prisma.dmmf.datamodel.models)[number];
type Delegate = {
  findMany: (args?: object) => Promise<Record<string, unknown>[]>;
  deleteMany: (args?: object) => Promise<unknown>;
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
};

const models = (): readonly Model[] => Prisma.dmmf.datamodel.models;
const delegate = (db: unknown, model: Model) => (db as Record<string, Delegate>)[model.name[0]!.toLowerCase() + model.name.slice(1)]!;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  /** Last applied migration, so a restore can refuse a backup from a newer app version */
  migration: string | null;
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
};

async function latestMigration(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1",
    );
    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}

/** Every table as gzipped JSON. */
export async function createBackup(): Promise<{ buffer: Buffer; counts: Record<string, number> }> {
  const tables: BackupFile["tables"] = {};
  const counts: Record<string, number> = {};
  for (const model of models()) {
    const id = model.fields.find((f) => f.isId);
    const rows = await delegate(prisma, model).findMany(id ? { orderBy: { [id.name]: "asc" } } : undefined);
    tables[model.name] = rows;
    counts[model.name] = rows.length;
  }
  const file: BackupFile = { format: BACKUP_FORMAT, version: VERSION, createdAt: new Date().toISOString(), migration: await latestMigration(), counts, tables };
  return { buffer: gzipSync(JSON.stringify(file)), counts };
}

export class BackupError extends Error {}

/** Reads and checks an uploaded backup (gzipped or plain JSON). */
export async function parseBackup(raw: Buffer): Promise<BackupFile> {
  let text: string;
  try {
    text = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8");
  } catch {
    throw new BackupError("This file is damaged or isn't a backup.");
  }
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't an Attendance Desk backup.");
  }
  if (file?.format !== BACKUP_FORMAT || typeof file.tables !== "object") throw new BackupError("This file isn't an Attendance Desk backup.");
  if (file.version > VERSION) throw new BackupError("This backup was made by a newer version of the app. Update the app first.");
  const current = await latestMigration();
  if (file.migration && current && file.migration > current) throw new BackupError("This backup was made by a newer version of the app. Update the app first.");
  const known = new Set(models().map((m) => m.name));
  const unknown = Object.keys(file.tables).filter((t) => !known.has(t));
  if (unknown.length) throw new BackupError(`This backup has tables this app doesn't know (${unknown.join(", ")}).`);
  if (!file.tables.User?.length) throw new BackupError("This backup has no sign-ins, so nobody could sign in after restoring it.");
  return file;
}

/** JSON turns dates into strings and nulls in JSON columns need Prisma's DbNull. */
function revive(model: Model, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of model.fields) {
    if (f.kind === "object" || !(f.name in row)) continue;
    const v = row[f.name];
    if (f.type === "DateTime" && typeof v === "string") out[f.name] = new Date(v);
    else if (f.type === "Json" && v === null) out[f.name] = Prisma.DbNull;
    else out[f.name] = v;
  }
  return out;
}

/** Replaces every table with the backup's rows, all or nothing. */
export async function restoreBackup(file: BackupFile): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      // Rows go in table by table, so references are checked once everything is back.
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const model of models()) await delegate(tx, model).deleteMany();
        for (const model of models()) {
          const rows = (file.tables[model.name] ?? []).map((r) => revive(model, r));
          for (let i = 0; i < rows.length; i += 500) await delegate(tx, model).createMany({ data: rows.slice(i, i + 500) });
          counts[model.name] = rows.length;
        }
      } finally {
        await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
      }
    },
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );
  return counts;
}

// ---- Copies kept on the server --------------------------------------------------

export type StoredBackup = { name: string; size: number; createdAt: string; kind: "daily" | "manual" | "pre-restore" };

const SAFE_NAME = /^(daily|manual|pre-restore)-[\dT-]+\.json\.gz$/;
export const isBackupName = (name: string) => SAFE_NAME.test(name);

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");

/** Writes a backup into storage/backups and returns its file name. */
export async function saveBackup(kind: StoredBackup["kind"]): Promise<string> {
  const { buffer } = await createBackup();
  await mkdir(BACKUP_DIR, { recursive: true });
  const name = `${kind}-${stamp()}.json.gz`;
  await writeFile(path.join(BACKUP_DIR, name), buffer);
  if (kind === "daily") await prune("daily", KEEP_DAILY);
  return name;
}

async function prune(kind: StoredBackup["kind"], keep: number) {
  const old = (await listBackups()).filter((b) => b.kind === kind).slice(keep);
  await Promise.all(old.map((b) => unlink(path.join(BACKUP_DIR, b.name)).catch(() => {})));
}

/** Newest first. */
export async function listBackups(): Promise<StoredBackup[]> {
  const names = await readdir(BACKUP_DIR).catch(() => [] as string[]);
  const rows = await Promise.all(
    names.filter(isBackupName).map(async (name) => {
      const s = await stat(path.join(BACKUP_DIR, name));
      return { name, size: s.size, createdAt: s.mtime.toISOString(), kind: name.split("-")[0] === "pre" ? "pre-restore" : (name.split("-")[0] as StoredBackup["kind"]) };
    }),
  );
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readStoredBackup(name: string): Promise<Buffer> {
  if (!isBackupName(name)) throw new BackupError("Unknown backup.");
  return readFile(path.join(BACKUP_DIR, name));
}

export async function deleteStoredBackup(name: string) {
  if (!isBackupName(name)) throw new BackupError("Unknown backup.");
  await unlink(path.join(BACKUP_DIR, name));
}
