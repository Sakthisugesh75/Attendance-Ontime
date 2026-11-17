"use server";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { loginSchema, type LoginInput } from "@/lib/auth-schemas";
import { signIn, signOut, unstable_update } from "@/lib/auth";
import { writeAudit, requestIp } from "@/lib/audit";
import { sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { hitRateLimit } from "@/lib/rate-limit";
import { actionUser, Forbidden } from "@/lib/session";
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validations/auth";

export type FormResult = { ok: true; message?: string } | { ok: false; error: string };

const LOGIN_ERRORS: Record<string, string> = {
  invalid: "Wrong email/phone or password.",
  locked: "Too many failed attempts. Your account is locked for 15 minutes.",
  rate_limited: "Too many sign-in attempts from this network. Wait a few minutes and try again.",
};

export async function login(values: LoginInput): Promise<FormResult> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  try {
    await signIn("credentials", { ...parsed.data, remember: String(parsed.data.remember), redirect: false });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      const code = (err as AuthError & { code?: string }).code ?? "invalid";
      return { ok: false, error: LOGIN_ERRORS[code] ?? LOGIN_ERRORS.invalid! };
    }
    throw err;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function changePassword(values: unknown): Promise<FormResult> {
  try {
    const user = await actionUser();
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(parsed.data.currentPassword, row.passwordHash))) return { ok: false, error: "Current password is wrong." };

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), mustChangePassword: false },
    });
    await writeAudit({ actorId: user.id, action: "PASSWORD_CHANGED", entity: "User", entityId: user.id });
    // Refresh the session so the "must change password" gate lifts immediately.
    await unstable_update({});
    return { ok: true, message: "Password changed" };
  } catch (err) {
    if (err instanceof Forbidden) return { ok: false, error: err.message };
    throw err;
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const RESET_TTL_MS = 60 * 60 * 1000;

/** Always answers the same way so the form can't be used to discover which emails exist. */
export async function requestPasswordReset(values: unknown): Promise<FormResult> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  const done: FormResult = { ok: true, message: "If that email has an account, a reset link is on its way. It works for 1 hour." };

  const ip = (await requestIp()) ?? "local";
  if (hitRateLimit(`reset:${ip}`, 5, 15 * 60 * 1000)) return done;

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.isActive) return done;

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = new URL(`/reset-password?token=${token}`, process.env.APP_URL ?? "http://localhost:6001").toString();
  await sendMail({
    to: user.email!,
    subject: "Reset your Attendance password",
    text: `Someone asked to reset the password for this account.\n\nOpen this link within 1 hour to choose a new password:\n${link}\n\nIf it wasn't you, ignore this email.`,
  });
  await writeAudit({ actorId: user.id, action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: user.id });
  return done;
}

export async function resetPassword(values: unknown): Promise<FormResult> {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };

  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return { ok: false, error: "This reset link has expired or was already used. Ask for a new one." };

  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    }),
  ]);
  await writeAudit({ actorId: row.userId, action: "PASSWORD_RESET", entity: "User", entityId: row.userId });
  return { ok: true, message: "Password updated. Sign in with your new password." };
}
