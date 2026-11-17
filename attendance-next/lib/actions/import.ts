"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { commitImport, createPreview, ImportError, undoImport } from "@/lib/import/service";
import { actionUser, Forbidden } from "@/lib/session";
import { commitImportSchema, type CommitImportInput } from "@/lib/validations/import";

export type ImportActionResult = { ok: true; id: number; message: string } | { ok: false; error: string };

const fail = (error: string): ImportActionResult => ({ ok: false, error });

function handle(err: unknown, what: string): ImportActionResult {
  if (err instanceof Forbidden || err instanceof ImportError) return fail(err.message);
  console.error(`${what} failed`, err);
  return fail(`Could not ${what}. Nothing was changed. Try again.`);
}

export async function uploadWorkbook(form: FormData): Promise<ImportActionResult> {
  try {
    const user = await actionUser("import.run");
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Choose an Excel file.");
    const id = await createPreview(file, user.id);
    revalidatePath("/import");
    return { ok: true, id, message: "File read. Review it before importing." };
  } catch (err) {
    return handle(err, "read the file");
  }
}

export async function confirmImport(id: number, input: CommitImportInput): Promise<ImportActionResult> {
  try {
    const user = await actionUser("import.run");
    z.number().int().positive().parse(id);
    const parsed = commitImportSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the choices");
    const res = await commitImport(id, parsed.data, user.id);
    revalidatePath("/", "layout");
    const days = res.counts.created + res.counts.updated;
    return { ok: true, id, message: `Imported ${days} days${res.createdEmployeeIds.length ? ` and added ${res.createdEmployeeIds.length} employees` : ""}.` };
  } catch (err) {
    return handle(err, "import the file");
  }
}

export async function revertImport(id: number): Promise<ImportActionResult> {
  try {
    const user = await actionUser("import.run");
    z.number().int().positive().parse(id);
    const res = await undoImport(id, user.id);
    revalidatePath("/", "layout");
    return {
      ok: true,
      id,
      message: res.keptEmployees
        ? `Import undone. ${res.keptEmployees} added employee(s) were kept because they now have other data.`
        : "Import undone. Everything it added was removed.",
    };
  } catch (err) {
    return handle(err, "undo the import");
  }
}
