import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dbToYmd, istDate } from "@/lib/time";
import type { EmployeeListParams } from "@/lib/validations/employee";

export const PAGE_SIZE = 20;

/** Next free code: EMP + 3 digits, one above the highest existing EMP number (deleted rows included). */
export async function nextEmployeeCode(db: Pick<Prisma.TransactionClient, "employee"> = prisma): Promise<string> {
  const codes = await db.employee.findMany({ where: { code: { startsWith: "EMP" } }, select: { code: true } });
  const max = codes.reduce((m, { code }) => Math.max(m, Number(code.slice(3)) || 0), 0);
  return `EMP${String(max + 1).padStart(3, "0")}`;
}

/**
 * Server-side filtering, sorting and pagination for the employee table.
 * `reach` limits it to the employees the viewer may see (null = everyone).
 */
export async function listEmployees(params: EmployeeListParams, reach: number[] | null = null) {
  const inReach: Prisma.EmployeeWhereInput = reach ? { id: { in: reach } } : {};
  const where: Prisma.EmployeeWhereInput = {
    deletedAt: null,
    ...inReach,
    ...(params.status !== "ALL" && { status: params.status }),
    ...(params.department && { departmentId: params.department }),
    ...(params.q && {
      OR: [
        { fullName: { contains: params.q } },
        { code: { contains: params.q } },
        { email: { contains: params.q } },
        { phone: { contains: params.q.replace(/\D/g, "") || params.q } },
      ],
    }),
  };
  const orderBy: Prisma.EmployeeOrderByWithRelationInput =
    params.sort === "code" ? { code: params.dir } : params.sort === "joined" ? { joiningDate: params.dir } : { fullName: params.dir };

  const [rows, total, counts] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: [orderBy, { id: "asc" }],
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        department: true,
        designation: true,
        manager: { select: { id: true, fullName: true } },
        user: { select: { isActive: true, accessRole: { select: { name: true } } } },
      },
    }),
    prisma.employee.count({ where }),
    prisma.employee.groupBy({ by: ["status"], where: { deletedAt: null, ...inReach }, _count: true }),
  ]);

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: {
      ALL: counts.reduce((s, c) => s + c._count, 0),
      ACTIVE: counts.find((c) => c.status === "ACTIVE")?._count ?? 0,
      ON_NOTICE: counts.find((c) => c.status === "ON_NOTICE")?._count ?? 0,
      EXITED: counts.find((c) => c.status === "EXITED")?._count ?? 0,
    },
    rows: rows.map((e) => ({
      id: e.id,
      code: e.code,
      fullName: e.fullName,
      photo: e.photoPath ? `/api/files/${e.photoPath}` : null,
      phone: e.phone,
      email: e.email,
      department: e.department?.name ?? null,
      designation: e.designation?.name ?? null,
      manager: e.manager?.fullName ?? null,
      joiningDate: dbToYmd(e.joiningDate),
      exitDate: e.exitDate ? dbToYmd(e.exitDate) : null,
      status: e.status,
      /** Role name, "DISABLED", or null without a sign-in */
      login: e.user ? (e.user.isActive ? (e.user.accessRole?.name ?? "Employee") : "DISABLED") : null,
    })),
  };
}

export type EmployeeRow = Awaited<ReturnType<typeof listEmployees>>["rows"][number];

/**
 * Choices for the employee form. Managers are limited to `reach` (null = everyone) so a
 * team-scoped user can only place people inside their own team.
 */
export async function employeeFormOptions(excludeId?: number, reach: number[] | null = null) {
  const [departments, designations, managers, shifts, roles] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.designation.findMany({ orderBy: { name: "asc" } }),
    prisma.employee.findMany({
      where: { deletedAt: null, status: { not: "EXITED" }, ...(excludeId && { id: { not: excludeId } }), ...(reach && { AND: [{ id: { in: reach } }] }) },
      select: { id: true, fullName: true, code: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.shift.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }], include: { days: { orderBy: { weekday: "asc" } } } }),
    prisma.accessRole.findMany({ select: { id: true, name: true, description: true, systemKey: true }, orderBy: { name: "asc" } }),
  ]);
  // Built-in roles first (Employee, HR / Manager, Super Admin), then custom roles by name.
  const order = (k: string | null) => (k === "EMPLOYEE" ? 0 : k === "HR" ? 1 : k === "SUPER_ADMIN" ? 2 : 3);
  roles.sort((a, b) => order(a.systemKey) - order(b.systemKey));
  return {
    departments: departments.map((d) => d.name),
    designations: designations.map((d) => d.name),
    managers,
    shifts: shifts.map((s) => ({
      id: s.id,
      name: s.name,
      isDefault: s.isDefault,
      summary: s.days.length ? `${s.days[0]!.startTime}–${s.days[0]!.endTime}` : "No timings",
    })),
    /** Sign-in roles to pick from; the actions decide who may assign which. */
    roles,
    employeeRoleId: roles.find((x) => x.systemKey === "EMPLOYEE")?.id ?? null,
    nextCode: await nextEmployeeCode(),
    today: istDate(),
  };
}

export type EmployeeFormOptions = Awaited<ReturnType<typeof employeeFormOptions>>;

export async function getEmployee(id: number) {
  const e = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: {
      department: true,
      designation: true,
      manager: { select: { id: true, fullName: true, code: true } },
      reports: { where: { deletedAt: null }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } },
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          accessRoleId: true,
          accessRole: { select: { name: true, systemKey: true } },
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
          lockedUntil: true,
        },
      },
      shifts: { orderBy: { effectiveFrom: "desc" }, include: { shift: { select: { id: true, name: true } } } },
    },
  });
  if (!e) return null;
  const today = istDate();
  const current = e.shifts.find((s) => dbToYmd(s.effectiveFrom) <= today && (!s.effectiveTo || dbToYmd(s.effectiveTo) >= today)) ?? e.shifts.at(-1);
  return {
    id: e.id,
    code: e.code,
    fullName: e.fullName,
    photo: e.photoPath ? `/api/files/${e.photoPath}` : null,
    phone: e.phone ?? "",
    email: e.email ?? "",
    dateOfBirth: e.dateOfBirth ? dbToYmd(e.dateOfBirth) : "",
    department: e.department?.name ?? "",
    designation: e.designation?.name ?? "",
    joiningDate: dbToYmd(e.joiningDate),
    exitDate: e.exitDate ? dbToYmd(e.exitDate) : "",
    status: e.status,
    manager: e.manager,
    managerId: e.managerId,
    reportRequired: e.reportRequired,
    reports: e.reports,
    user: e.user,
    shiftId: current?.shiftId ?? null,
    shiftHistory: e.shifts.map((s) => ({ name: s.shift.name, from: dbToYmd(s.effectiveFrom), to: s.effectiveTo ? dbToYmd(s.effectiveTo) : null })),
  };
}

export type EmployeeDetail = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;

/** Recent days with punches, newest first. */
export async function recentPunches(employeeId: number, take = 10) {
  const rows = await prisma.attendanceRecord.findMany({
    where: { employeeId, punchInAt: { not: null } },
    orderBy: { date: "desc" },
    take,
  });
  return rows.map((r) => ({
    date: dbToYmd(r.date),
    punchInAt: r.punchInAt,
    punchOutAt: r.punchOutAt,
    status: r.statusOverride ?? r.status,
    workedMinutes: r.workedMinutes,
    lateMinutes: r.lateMinutes,
    source: r.source,
    hasLocation: r.punchInLat !== null,
    selfieIn: r.punchInSelfie ? `/api/files/${r.punchInSelfie}` : null,
  }));
}

