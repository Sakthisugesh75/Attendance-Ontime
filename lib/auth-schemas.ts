import { z } from "zod";

/** Shared by the login form (client) and the Credentials provider (server). */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email, phone or username").max(191),
  password: z.string().min(1, "Enter your password").max(200),
  // Auth.js passes credentials as strings, so "false" must not coerce to true.
  remember: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
});

export type LoginInput = z.input<typeof loginSchema>;
