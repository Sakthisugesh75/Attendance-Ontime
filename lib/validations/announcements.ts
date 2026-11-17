import { z } from "zod";
import { istDate } from "@/lib/time";

export const ANNOUNCEMENT_TITLE_MAX = 150;
export const ANNOUNCEMENT_BODY_MAX = 2000;

/** Plain text: Windows line endings folded, trailing spaces per line and runs of 3+ blank lines trimmed. */
export const normalizeBody = (v: string) =>
  v
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const base = z.object({
  title: z.string().trim().min(3, "Give it a short title").max(ANNOUNCEMENT_TITLE_MAX, `Keep the title under ${ANNOUNCEMENT_TITLE_MAX} characters`),
  body: z
    .string()
    .transform(normalizeBody)
    .pipe(z.string().min(1, "Write the announcement").max(ANNOUNCEMENT_BODY_MAX, `Keep it under ${ANNOUNCEMENT_BODY_MAX} characters`)),
  pinned: z.boolean(),
  /** Last IST day it is shown; "" = until removed. */
  expiresOn: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), z.literal("")]),
  /** Send a bell notification (and email) to everyone. */
  notify: z.boolean(),
});

/**
 * Shared by the announcement sheet (client) and the announcement actions (server). The end date
 * must not be in the past, except an unchanged one (`keepExpiresOn`) while editing an old post.
 */
export const announcementSchemaFor = (keepExpiresOn = "") =>
  base.superRefine((v, ctx) => {
    if (v.expiresOn && v.expiresOn !== keepExpiresOn && v.expiresOn < istDate()) ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "Pick today or a later date" });
  });

export const announcementSchema = announcementSchemaFor();

export type AnnouncementInput = z.input<typeof announcementSchema>;
export type AnnouncementValues = z.output<typeof announcementSchema>;
