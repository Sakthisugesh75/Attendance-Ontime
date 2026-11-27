import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dbToYmd } from "@/lib/time";
import type { AssetConditionKey, AssetListParams, AssetStatusKey } from "@/lib/validations/assets";

const include = {
  employee: { select: { id: true, fullName: true, code: true, deletedAt: true } },
  events: { orderBy: { createdAt: "desc" as const }, take: 50, include: { employee: { select: { fullName: true } } } },
} satisfies Prisma.AssetInclude;

function toRow(a: Prisma.AssetGetPayload<{ include: typeof include }>) {
  return {
    id: a.id,
    tag: a.tag,
    name: a.name,
    category: a.category,
    serialNo: a.serialNo ?? "",
    purchaseDate: a.purchaseDate ? dbToYmd(a.purchaseDate) : "",
    cost: a.cost === null ? null : Number(a.cost),
    status: a.status as AssetStatusKey,
    condition: a.condition as AssetConditionKey,
    notes: a.notes,
    holder: a.employee ? { id: a.employee.id, name: a.employee.fullName, code: a.employee.code, removed: !!a.employee.deletedAt } : null,
    assignedAt: a.assignedAt ? dbToYmd(a.assignedAt) : null,
    events: a.events.map((e) => ({
      id: e.id,
      action: e.action,
      employee: e.employee?.fullName ?? null,
      condition: (e.condition as AssetConditionKey | null) ?? null,
      note: e.note,
      by: e.actorName,
      at: e.createdAt.toISOString(),
    })),
  };
}
export type AssetRow = ReturnType<typeof toRow>;

export async function listAssets(params: AssetListParams) {
  const where: Prisma.AssetWhereInput = {
    ...(params.status !== "ALL" && { status: params.status }),
    ...(params.category && { category: params.category }),
    ...(params.q && {
      OR: [{ tag: { contains: params.q } }, { name: { contains: params.q } }, { serialNo: { contains: params.q } }, { employee: { fullName: { contains: params.q } } }],
    }),
  };
  const [rows, counts, categories, value] = await Promise.all([
    prisma.asset.findMany({ where, include, orderBy: [{ tag: "asc" }], take: 500 }),
    prisma.asset.groupBy({ by: ["status"], _count: true }),
    prisma.asset.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    prisma.asset.aggregate({ where: { status: { not: "RETIRED" } }, _sum: { cost: true } }),
  ]);
  const count = (s: AssetStatusKey) => counts.find((c) => c.status === s)?._count ?? 0;
  return {
    rows: rows.map(toRow),
    counts: { ALL: counts.reduce((s, c) => s + c._count, 0), AVAILABLE: count("AVAILABLE"), ASSIGNED: count("ASSIGNED"), REPAIR: count("REPAIR"), RETIRED: count("RETIRED") },
    categories: categories.map((c) => c.category),
    value: Number(value._sum.cost ?? 0),
  };
}

/** Assets someone holds now (profile card, "my assets"). */
export async function assetsHeldBy(employeeId: number) {
  const rows = await prisma.asset.findMany({ where: { employeeId, status: "ASSIGNED" }, include, orderBy: { assignedAt: "asc" } });
  return rows.map(toRow);
}

/** Next free tag: AST + 3 digits. */
export async function nextAssetTag(): Promise<string> {
  const tags = await prisma.asset.findMany({ where: { tag: { startsWith: "AST" } }, select: { tag: true } });
  const max = tags.reduce((m, { tag }) => Math.max(m, Number(tag.slice(3)) || 0), 0);
  return `AST${String(max + 1).padStart(3, "0")}`;
}

/** People who can receive an asset. */
export const assignableEmployees = () =>
  prisma.employee
    .findMany({ where: { deletedAt: null, status: { not: "EXITED" } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, code: true } })
    .then((rows) => rows.map((e) => ({ id: e.id, name: e.fullName, code: e.code })));
