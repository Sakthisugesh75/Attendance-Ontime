import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { capsSchema, companySchema, geofenceSchema, punchSchema } from "@/lib/validations/settings";

/**
 * Every setting key with its schema and default. Stored as JSON rows in CompanySetting.
 * The schemas live in lib/validations/settings.ts so the settings forms can share them.
 */
export const settingSchemas = {
  company: companySchema,
  geofence: geofenceSchema,
  punch: punchSchema,
  caps: capsSchema,
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.output<(typeof settingSchemas)[K]>;

export const settingDefaults: { [K in SettingKey]: SettingValue<K> } = {
  company: { name: "My Company", address: "", logoPath: null },
  // Coimbatore city centre; off until an admin sets the office location.
  geofence: { enabled: false, lat: 11.0168, lng: 76.9558, radiusMeters: 200 },
  punch: { selfieRequired: false },
  caps: { wfhPerMonth: 4, permissionPerMonth: 2, permissionMaxMinutes: 120 },
};

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.companySetting.findUnique({ where: { key } });
  const parsed = settingSchemas[key].safeParse(row?.value);
  return (parsed.success ? parsed.data : settingDefaults[key]) as SettingValue<K>;
}

/** Several settings in one query. */
export async function getSettings<K extends SettingKey>(...keys: K[]): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = await prisma.companySetting.findMany({ where: { key: { in: keys } } });
  const out = {} as { [P in K]: SettingValue<P> };
  for (const key of keys) {
    const parsed = settingSchemas[key].safeParse(rows.find((r) => r.key === key)?.value);
    (out as Record<string, unknown>)[key] = parsed.success ? parsed.data : settingDefaults[key];
  }
  return out;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>) {
  const data = settingSchemas[key].parse(value);
  await prisma.companySetting.upsert({ where: { key }, create: { key, value: data }, update: { value: data } });
}
