"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { distanceMeters } from "@/lib/attendance/geo";
import { recomputeDay } from "@/lib/attendance/service";
import { prisma } from "@/lib/prisma";
import { actionUser, Forbidden } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { istDate, ymdToDb } from "@/lib/time";
import { punchSchema, type PunchInput } from "@/lib/validations/punch";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const STORAGE = path.join(process.cwd(), "storage");

export async function punchIn(input: PunchInput): Promise<ActionResult> {
  return punch("IN", input);
}

export async function punchOut(input: PunchInput): Promise<ActionResult> {
  return punch("OUT", input);
}

async function punch(kind: "IN" | "OUT", raw: PunchInput): Promise<ActionResult> {
  try {
    const user = await actionUser();
    if (!user.employeeId) return fail("Your sign-in isn't linked to an employee record. Ask HR to link it.");
    const parsed = punchSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid punch");
    const { location, selfie } = parsed.data;

    // The server clock is the only clock that counts.
    const now = new Date();
    const today = istDate(now);

    const employee = await prisma.employee.findUnique({ where: { id: user.employeeId } });
    if (!employee || employee.deletedAt || employee.status === "EXITED") return fail("Your employee record is not active.");
    if (today < employee.joiningDate.toISOString().slice(0, 10)) return fail("You can punch in from your joining date.");

    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: employee.id, date: ymdToDb(today) } } });
    if (kind === "IN" && existing?.punchInAt) return fail("You have already punched in today.");
    if (kind === "OUT" && !existing?.punchInAt) return fail("Punch in first.");
    if (kind === "OUT" && existing?.punchOutAt) return fail("You have already punched out today.");

    // Geofence: required unless an approved WFH / on-duty covers today.
    const geofence = await getSetting("geofence");
    if (geofence.enabled) {
      const remote = await prisma.attendanceRequest.count({
        where: {
          employeeId: employee.id,
          type: { in: ["WFH", "ON_DUTY"] },
          status: "APPROVED",
          fromDate: { lte: ymdToDb(today) },
          toDate: { gte: ymdToDb(today) },
        },
      });
      if (!remote) {
        if (!location) return fail("Allow location access to punch from the office.");
        const distance = distanceMeters(location, geofence);
        // Give the phone's reported accuracy (capped) the benefit of the doubt.
        if (distance > geofence.radiusMeters + Math.min(location.accuracy, 100)) {
          return fail(`You are about ${Math.round(distance)} m from the office. Punch from within ${geofence.radiusMeters} m.`);
        }
      }
    }

    const { selfieRequired } = await getSetting("punch");
    if (selfieRequired && !selfie) return fail("Take a selfie to punch.");
    const selfiePath = selfie ? await saveSelfie(employee.id, today, kind, selfie) : null;

    const geo = location ? { lat: location.lat, lng: location.lng, acc: Math.round(location.accuracy) } : null;
    const data =
      kind === "IN"
        ? { punchInAt: now, punchInLat: geo?.lat, punchInLng: geo?.lng, punchInAccuracy: geo?.acc, punchInSelfie: selfiePath }
        : { punchOutAt: now, punchOutLat: geo?.lat, punchOutLng: geo?.lng, punchOutAccuracy: geo?.acc, punchOutSelfie: selfiePath };

    // The unique (employeeId, date) index makes a double-tap race fail instead of creating two records.
    const record = existing
      ? await prisma.attendanceRecord.update({
          where: { id: existing.id, ...(kind === "IN" ? { punchInAt: null } : { punchOutAt: null }) },
          data,
        })
      : await prisma.attendanceRecord.create({ data: { employeeId: employee.id, date: ymdToDb(today), source: "WEB", ...data } });

    await recomputeDay(employee.id, today);
    await writeAudit({ actorId: user.id, action: kind === "IN" ? "PUNCH_IN" : "PUNCH_OUT", entity: "AttendanceRecord", entityId: record.id, after: { at: now.toISOString(), location: geo } });

    revalidatePath("/dashboard");
    revalidatePath("/attendance");
    return { ok: true, message: kind === "IN" ? "Punched in" : "Punched out" };
  } catch (err) {
    if (err instanceof Forbidden) return fail(err.message);
    if (isUniqueOrMissing(err)) return fail(kind === "IN" ? "You have already punched in today." : "You have already punched out today.");
    console.error("punch failed", err);
    return fail("Could not record the punch. Try again.");
  }
}

async function saveSelfie(employeeId: number, ymd: string, kind: "IN" | "OUT", dataUrl: string) {
  const rel = path.join("selfies", ymd.slice(0, 7), `${employeeId}-${ymd}-${kind.toLowerCase()}.jpg`);
  const abs = path.join(STORAGE, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  return rel.replaceAll("\\", "/");
}

function isUniqueOrMissing(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return code === "P2002" || code === "P2025";
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}
