import { z } from "zod";

export const ASSET_STATUSES = ["AVAILABLE", "ASSIGNED", "REPAIR", "RETIRED"] as const;
export type AssetStatusKey = (typeof ASSET_STATUSES)[number];
export const ASSET_CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED"] as const;
export type AssetConditionKey = (typeof ASSET_CONDITIONS)[number];

/** Asset states reuse status palettes (no new colours) and differ by word and icon. */
export const ASSET_STATUS_META: Record<AssetStatusKey, { label: string; chip: string }> = {
  AVAILABLE: { label: "In store", chip: "bg-st-holiday-tint text-st-holiday-fg" },
  ASSIGNED: { label: "With employee", chip: "bg-st-present-tint text-st-present-fg" },
  REPAIR: { label: "In repair", chip: "bg-st-late-tint text-st-late-fg" },
  RETIRED: { label: "Retired", chip: "bg-sunken text-ink-3" },
};
export const CONDITION_LABEL: Record<AssetConditionKey, string> = { NEW: "New", GOOD: "Good", FAIR: "Fair", DAMAGED: "Damaged" };

export const EVENT_LABEL: Record<string, string> = {
  CREATED: "Added",
  UPDATED: "Details edited",
  ASSIGNED: "Handed over",
  RETURNED: "Returned",
  REPAIR: "Sent for repair",
  REPAIRED: "Back from repair",
  RETIRED: "Retired",
  RESTORED: "Back in use",
};

/** Suggested categories; anything else can be typed. */
export const ASSET_CATEGORY_SUGGESTIONS = ["Laptop", "Desktop", "Monitor", "Phone", "SIM card", "ID card", "Access card", "Headset", "Keyboard & mouse", "Vehicle", "Furniture", "Other"];

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalYmd = z.union([ymd, z.literal("")]).default("");

export const assetSchema = z.object({
  tag: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Enter an asset tag")
    .max(30, "At most 30 characters")
    .regex(/^[A-Z0-9/_-]+$/, "Letters, digits, - / and _ only"),
  name: z.string().trim().min(2, "Enter a name, e.g. Dell Latitude 5440").max(120),
  category: z.string().trim().min(2, "Pick or type a category").max(60),
  serialNo: z.string().trim().max(100).default(""),
  purchaseDate: optionalYmd,
  cost: z.union([z.coerce.number().min(0, "Cost can't be negative").max(1_00_00_000, "Cost is too large"), z.literal(""), z.null()]).transform((v) => (v === "" || v === null ? null : v)),
  condition: z.enum(ASSET_CONDITIONS),
  notes: z.string().trim().max(1000).default(""),
});
export type AssetInput = z.input<typeof assetSchema>;

export const assignSchema = z.object({
  employeeId: z.coerce.number({ invalid_type_error: "Pick an employee" }).int().positive("Pick an employee"),
  date: ymd,
  note: z.string().trim().max(500).default(""),
});

export const returnSchema = z.object({
  condition: z.enum(ASSET_CONDITIONS),
  /** Where it goes after coming back */
  next: z.enum(["AVAILABLE", "REPAIR", "RETIRED"]),
  note: z.string().trim().max(500).default(""),
});

export const statusSchema = z.object({
  status: z.enum(["AVAILABLE", "REPAIR", "RETIRED"]),
  note: z.string().trim().max(500).default(""),
});

export const assetListParams = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(["ALL", ...ASSET_STATUSES]).catch("ALL"),
  category: z.string().trim().max(60).catch(""),
});
export type AssetListParams = z.infer<typeof assetListParams>;
