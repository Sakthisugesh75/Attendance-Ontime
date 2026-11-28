import { z } from "zod";

/** ~350 KB of JPEG once base64-decoded; the client downsizes selfies to 480px before sending. */
const MAX_SELFIE_CHARS = 480_000;

export const punchSchema = z.object({
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(100_000),
    })
    .nullable(),
  selfie: z
    .string()
    .startsWith("data:image/jpeg;base64,", "Selfie must be a JPEG image")
    .max(MAX_SELFIE_CHARS, "Selfie is too large")
    .nullable(),
  /** "arrival": tapped the native app's office-arrival notification (punch-in only; no selfie; must be inside the office radius). */
  via: z.enum(["app", "arrival"]).optional(),
});

export type PunchInput = z.infer<typeof punchSchema>;
