"use server";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recipientsFor } from "@/lib/access/recipients";
import { writeAudit } from "@/lib/audit";
import { canDecide, canPay } from "@/lib/expenses";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden, scopeEmployeeIds } from "@/lib/session";
import { addDays, formatDate, istDate, ymdToDb } from "@/lib/time";
import { ATTACHMENT_TYPES, sniffAttachment } from "@/lib/validations/requests";
import { categorySchema, claimLimit, claimSchema, decisionSchema, formatRupees, RECEIPT_MAX_BYTES, type CategoryInput } from "@/lib/validations/expenses";

export type ExpenseResult = { ok: true; message: string } | { ok: false; error: string; field?: string };

const STORAGE = path.join(process.cwd(), "storage");
const fail = (error: string, field?: string): ExpenseResult => ({ ok: false, error, field });
const done = (message: string): ExpenseResult => {
  revalidatePath("/expenses");
  return { ok: true, message };
};

async function guarded(name: string, fn: () => Promise<ExpenseResult>): Promise<ExpenseResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues[0]?.message ?? "Check the details and try again.");
    console.error(`${name} failed`, err);
    return fail("Something went wrong. Try again.");
  }
}

const describe = (c: { amount: unknown; category: { name: string }; expenseDate: Date }) =>
  `${formatRupees(Number(c.amount))} · ${c.category.name} · ${formatDate(c.expenseDate.toISOString().slice(0, 10))}`;

/** Employee submits a claim (with a receipt when the category needs one). */
export async function submitClaim(form: FormData): Promise<ExpenseResult> {
  return guarded("submitClaim", async () => {
    const actor = await actionUser();
    if (!actor.employeeId) return fail("Only people with an employee record can claim expenses.");
    const parsed = claimSchema.safeParse({
      categoryId: form.get("categoryId"),
      expenseDate: form.get("expenseDate"),
      amount: form.get("amount"),
      description: form.get("description"),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const v = parsed.data;
    const today = istDate();
    if (v.expenseDate > today) return fail("The expense date can't be in the future.", "expenseDate");
    if (v.expenseDate < addDays(today, -365)) return fail("Claims must be made within a year of the expense.", "expenseDate");

    const [category, me] = await Promise.all([
      prisma.expenseCategory.findFirst({ where: { id: v.categoryId, isActive: true }, include: { limits: true } }),
      prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, include: { manager: { select: { id: true, deletedAt: true, userId: true, user: { select: { isActive: true } } } } } }),
    ]);
    if (!category) return fail("Pick a valid category.", "categoryId");
    const limit = claimLimit(
      { defaultLimit: category.defaultLimit === null ? null : Number(category.defaultLimit), limits: category.limits.map((l) => ({ designationId: l.designationId, maxAmount: Number(l.maxAmount) })) },
      me.designationId,
    );
    if (limit !== null && v.amount > limit) return fail(`${category.name} claims are limited to ${formatRupees(limit)} each.`, "amount");

    const file = form.get("receipt");
    let receipt: { bytes: Uint8Array; kind: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > RECEIPT_MAX_BYTES) return fail("The receipt must be 5 MB or smaller.", "receipt");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = sniffAttachment(bytes);
      if (!kind || !ATTACHMENT_TYPES[file.type]) return fail("Attach the receipt as a PDF, JPG or PNG.", "receipt");
      receipt = { bytes, kind };
    } else if (category.receiptRequired) {
      return fail(`${category.name} claims need a receipt.`, "receipt");
    }

    let receiptPath: string | null = null;
    if (receipt) {
      receiptPath = `receipts/${actor.employeeId}-${Date.now()}-${randomBytes(4).toString("hex")}.${receipt.kind}`;
      await mkdir(path.join(STORAGE, "receipts"), { recursive: true });
      await writeFile(path.join(STORAGE, receiptPath), receipt.bytes);
    }

    // A reporting manager who still works here and can sign in approves first; otherwise HR does.
    const managerUser = me.manager && !me.manager.deletedAt && me.manager.userId && me.manager.user?.isActive ? me.manager.userId : null;
    const claim = await prisma.$transaction(async (tx) => {
      const c = await tx.expenseClaim.create({
        data: { employeeId: me.id, categoryId: category.id, expenseDate: ymdToDb(v.expenseDate), amount: v.amount, description: v.description, receiptPath, status: managerUser ? "PENDING_MANAGER" : "PENDING_HR" },
        include: { category: true },
      });
      await writeAudit({ actorId: actor.id, action: "CREATE", entity: "ExpenseClaim", entityId: c.id, after: { amount: v.amount, category: category.name, date: v.expenseDate, receipt: !!receiptPath } }, tx);
      return c;
    });

    const to = managerUser ? [managerUser] : await recipientsFor("expenses.manage", me.id);
    await notifyUsers(
      to.filter((id) => id !== actor.id),
      { title: `Expense claim from ${me.fullName}`, body: `${describe(claim)}\n${v.description}`, link: `/expenses?view=approvals&id=${claim.id}` },
    );
    return done(managerUser ? "Claim sent to your manager" : "Claim sent to HR");
  });
}

/** The employee withdraws a claim nobody has finished deciding. */
export async function cancelClaim(id: number): Promise<ExpenseResult> {
  return guarded("cancelClaim", async () => {
    const actor = await actionUser();
    z.number().int().positive().parse(id);
    const c = await prisma.expenseClaim.findUnique({ where: { id } });
    if (!c || c.employeeId !== actor.employeeId) return fail("This claim no longer exists.");
    if (c.status !== "PENDING_MANAGER" && c.status !== "PENDING_HR") return fail("Only claims still waiting for approval can be cancelled.");
    await prisma.$transaction(async (tx) => {
      await tx.expenseClaim.update({ where: { id }, data: { status: "CANCELLED" } });
      await writeAudit({ actorId: actor.id, action: "CANCEL", entity: "ExpenseClaim", entityId: id, before: { status: c.status } }, tx);
    });
    return done("Claim cancelled");
  });
}

/** Approve or reject at the current step (see canDecide). */
export async function decideClaim(id: number, input: { decision: "APPROVE" | "REJECT"; comment?: string }): Promise<ExpenseResult> {
  return guarded("decideClaim", async () => {
    const actor = await actionUser();
    z.number().int().positive().parse(id);
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, "comment");
    const { decision, comment } = parsed.data;
    const c = await prisma.expenseClaim.findUnique({ where: { id }, include: { category: true, employee: { select: { id: true, fullName: true, managerId: true, userId: true } } } });
    if (!c) return fail("This claim no longer exists.");
    const reach = await scopeEmployeeIds(actor);
    if (!canDecide(actor, c, reach)) return fail(c.status === "PENDING_MANAGER" || c.status === "PENDING_HR" ? "You can't decide this claim." : "This claim has already been decided.");

    const now = new Date();
    const atManagerStep = c.status === "PENDING_MANAGER";
    const isManager = c.employee.managerId === actor.employeeId;
    // expenses.manage approving at the manager step covers both steps (unless they are the manager, who only does their step).
    const bothSteps = atManagerStep && !isManager;
    const by = { id: actor.id, name: actor.name };
    const data =
      decision === "REJECT"
        ? atManagerStep
          ? { status: "REJECTED" as const, managerById: by.id, managerByName: by.name, managerAt: now, managerComment: comment }
          : { status: "REJECTED" as const, hrById: by.id, hrByName: by.name, hrAt: now, hrComment: comment }
        : atManagerStep && !bothSteps
          ? { status: "PENDING_HR" as const, managerById: by.id, managerByName: by.name, managerAt: now, managerComment: comment || null }
          : {
              status: "APPROVED" as const,
              ...(atManagerStep && { managerById: by.id, managerByName: by.name, managerAt: now, managerComment: "Approved by HR" }),
              hrById: by.id,
              hrByName: by.name,
              hrAt: now,
              hrComment: comment || null,
            };

    // Only the step we read may change (two approvers clicking at once).
    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.expenseClaim.updateMany({ where: { id, status: c.status }, data });
      if (r.count === 0) return false;
      await writeAudit({ actorId: actor.id, action: decision === "APPROVE" ? "APPROVE" : "REJECT", entity: "ExpenseClaim", entityId: id, before: { status: c.status }, after: { status: data.status }, reason: comment || null }, tx);
      return true;
    });
    if (!updated) return fail("Someone else decided this claim a moment ago. Refresh to see it.");

    const what = describe(c);
    if (c.employee.userId) {
      const title =
        data.status === "REJECTED" ? "Expense claim rejected" : data.status === "PENDING_HR" ? "Expense claim approved by your manager" : "Expense claim approved";
      await notifyUsers([c.employee.userId], {
        title,
        body: `${what}${comment ? `\n${actor.name}: ${comment}` : ""}${data.status === "PENDING_HR" ? "\nIt's now with HR." : data.status === "APPROVED" ? "\nIt will be paid soon." : ""}`,
        link: "/expenses",
      });
    }
    if (data.status === "PENDING_HR") {
      const hr = (await recipientsFor("expenses.manage", c.employee.id)).filter((u) => u !== actor.id && u !== c.employee.userId);
      await notifyUsers(hr, { title: `Expense claim to approve: ${c.employee.fullName}`, body: `${what}\nApproved by ${actor.name}.`, link: `/expenses?view=approvals&id=${id}` });
    }
    return done(decision === "REJECT" ? "Claim rejected" : data.status === "PENDING_HR" ? "Approved and sent to HR" : "Claim approved");
  });
}

/** HR / accounts marks approved claims as paid (one payment reference for the batch). */
export async function markClaimsPaid(ids: number[], paymentRef: string): Promise<ExpenseResult> {
  return guarded("markClaimsPaid", async () => {
    const actor = await actionUser("expenses.manage");
    if (!canPay(actor)) throw new Forbidden();
    const list = z.array(z.number().int().positive()).min(1, "Pick at least one claim").max(500).parse(ids);
    const ref = z.string().trim().max(100, "Keep the reference under 100 characters").parse(paymentRef);
    const reach = await scopeEmployeeIds(actor);
    const claims = await prisma.expenseClaim.findMany({
      where: { id: { in: list }, status: "APPROVED", ...(reach && { employeeId: { in: reach } }), ...(actor.employeeId && { employeeId: { not: actor.employeeId } }) },
      include: { category: true, employee: { select: { userId: true } } },
    });
    if (!claims.length) return fail("None of these claims are waiting for payment.");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.expenseClaim.updateMany({ where: { id: { in: claims.map((c) => c.id) }, status: "APPROVED" }, data: { status: "PAID", paidById: actor.id, paidByName: actor.name, paidAt: now, paymentRef: ref || null } });
      await writeAudit({ actorId: actor.id, action: "PAY", entity: "ExpenseClaim", entityId: claims.length === 1 ? claims[0]!.id : null, after: { ids: claims.map((c) => c.id), total: claims.reduce((s, c) => s + Number(c.amount), 0), ref } }, tx);
    });
    for (const c of claims) {
      if (c.employee.userId) await notifyUsers([c.employee.userId], { title: "Expense claim paid", body: `${describe(c)}${ref ? `\nPayment reference: ${ref}` : ""}`, link: "/expenses" });
    }
    const total = claims.reduce((s, c) => s + Number(c.amount), 0);
    return done(`${claims.length} claim${claims.length === 1 ? "" : "s"} marked paid · ${formatRupees(total)}`);
  });
}

// ---- Categories (expenses.manage) ------------------------------------------------

export async function saveCategory(id: number | null, input: CategoryInput): Promise<ExpenseResult> {
  return guarded("saveCategory", async () => {
    const actor = await actionUser("expenses.manage");
    if (id !== null) z.number().int().positive().parse(id);
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]!.message, String(parsed.error.issues[0]!.path[0] ?? ""));
    const { limits, ...v } = parsed.data;
    const clash = await prisma.expenseCategory.findFirst({ where: { name: v.name, ...(id && { id: { not: id } }) } });
    if (clash) return fail("A category with this name already exists.", "name");
    const seen = new Set<number>();
    const clean = limits.filter((l) => !seen.has(l.designationId) && seen.add(l.designationId));
    await prisma.$transaction(async (tx) => {
      const c = id ? await tx.expenseCategory.update({ where: { id }, data: v }) : await tx.expenseCategory.create({ data: v });
      await tx.expenseLimit.deleteMany({ where: { categoryId: c.id } });
      if (clean.length) await tx.expenseLimit.createMany({ data: clean.map((l) => ({ categoryId: c.id, designationId: l.designationId, maxAmount: l.maxAmount })) });
      await writeAudit({ actorId: actor.id, action: id ? "UPDATE" : "CREATE", entity: "ExpenseCategory", entityId: c.id, after: { ...v, limits: clean } }, tx);
    });
    return done(id ? "Category saved" : "Category added");
  });
}

export async function deleteCategory(id: number): Promise<ExpenseResult> {
  return guarded("deleteCategory", async () => {
    const actor = await actionUser("expenses.manage");
    z.number().int().positive().parse(id);
    const c = await prisma.expenseCategory.findUnique({ where: { id }, include: { _count: { select: { claims: true } } } });
    if (!c) return fail("This category no longer exists.");
    if (c._count.claims) return fail(`${c.name} has claims. Turn it off instead so history stays intact.`);
    await prisma.$transaction(async (tx) => {
      await tx.expenseCategory.delete({ where: { id } });
      await writeAudit({ actorId: actor.id, action: "DELETE", entity: "ExpenseCategory", entityId: id, before: { name: c.name } }, tx);
    });
    return done(`${c.name} deleted`);
  });
}
