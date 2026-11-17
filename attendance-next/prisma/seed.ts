/**
 * Seed: run with `npm run db:seed` (empties and refills the database named in DATABASE_URL).
 * Creates the built-in access roles (Super Admin, HR / Manager, Employee) plus a custom
 * "Team Lead" role, 1 Super Admin, 1 HR, 5 employees (Karthik leads Anitha and Divya; everyone
 * else reports to Lakshmi), the default shift, weekly-off rule, Tamil Nadu 2026 holidays, leave
 * types + balances, dates of birth for some people, one pinned announcement, and demo punches for October and early November 2026. All people are fictional.
 */
import bcrypt from "bcryptjs";
import { PrismaClient, type HolidayType } from "@prisma/client";
import { SYSTEM_ROLES, type Permission } from "@/lib/access/permissions";
import { closeDay } from "@/lib/attendance/service";
import { isWeeklyOff, SATURDAY_POLICIES } from "@/lib/attendance/weekly-off";
import { addDays, istAt, istDate, minutesToHhmm, ymdToDb } from "@/lib/time";

const prisma = new PrismaClient();

const HOLIDAYS_2026: [string, string, HolidayType][] = [
  ["2026-01-01", "New Year's Day", "COMPANY"],
  ["2026-01-15", "Pongal", "STATE"],
  ["2026-01-16", "Thiruvalluvar Day", "STATE"],
  ["2026-01-17", "Uzhavar Thirunal", "STATE"],
  ["2026-01-26", "Republic Day", "NATIONAL"],
  ["2026-04-03", "Good Friday", "STATE"],
  ["2026-04-14", "Tamil New Year", "STATE"],
  ["2026-05-01", "Labour Day", "STATE"],
  ["2026-08-15", "Independence Day", "NATIONAL"],
  ["2026-09-14", "Vinayagar Chathurthi", "STATE"],
  ["2026-10-02", "Gandhi Jayanthi", "NATIONAL"],
  ["2026-10-19", "Ayudha Pooja", "STATE"],
  ["2026-10-20", "Vijayadasami", "STATE"],
  ["2026-11-08", "Deepavali", "STATE"],
  ["2026-12-25", "Christmas", "STATE"],
];

/** A fictional custom role so tests can exercise team-only reach. */
const TEAM_LEAD = {
  name: "Team Lead",
  description: "Sees and approves for the people who report to them",
  scope: "TEAM" as const,
  permissions: ["dashboard.org", "attendance.view", "requests.approve", "dailyreports.review", "employees.view", "reports.view"] as Permission[],
};

const PEOPLE = [
  { code: "EMP001", fullName: "Lakshmi Narayanan", dept: "Human Resources", desig: "HR Manager", phone: "9876500001", email: "hr@example.com", role: "HR" as const, password: "Hr@12345", joined: "2023-06-01", dob: "1986-08-21" },
  { code: "EMP002", fullName: "Anitha Raman", dept: "Operations", desig: "Operations Lead", phone: "9876500002", email: "anitha@example.com", role: "EMPLOYEE" as const, password: "Employee@123", joined: "2024-02-12", dob: "1994-12-03" },
  { code: "EMP003", fullName: "Karthik Selvam", dept: "Creative", desig: "Video Editor", phone: "9876500003", email: "karthik@example.com", role: "EMPLOYEE" as const, password: "Employee@123", joined: "2024-07-01", dob: "1996-02-29" },
  { code: "EMP004", fullName: "Meena Krishnan", dept: "Accounts", desig: "Accountant", phone: "9876500004", email: "meena@example.com", role: "EMPLOYEE" as const, password: "Employee@123", joined: "2025-01-06" },
  { code: "EMP005", fullName: "Praveen Kumar", dept: "Creative", desig: "Photographer", phone: "9876500005", email: "praveen@example.com", role: "EMPLOYEE" as const, password: "Employee@123", joined: "2026-10-12" },
  { code: "EMP006", fullName: "Divya Sundar", dept: "Operations", desig: "Coordinator", phone: "9876500006", email: "divya@example.com", role: "EMPLOYEE" as const, password: "Employee@123", joined: "2025-09-15", dob: "1999-11-18" },
];

const LEAVE_TYPES = [
  { code: "CL", name: "Casual Leave", yearlyQuota: 12, isPaid: true, carryForward: false, maxCarryForward: 0 },
  { code: "SL", name: "Sick Leave", yearlyQuota: 12, isPaid: true, carryForward: false, maxCarryForward: 0 },
  { code: "EL", name: "Earned Leave", yearlyQuota: 15, isPaid: true, carryForward: true, maxCarryForward: 30 },
  { code: "LOP", name: "Loss of Pay", yearlyQuota: 0, isPaid: false, carryForward: false, maxCarryForward: 0 },
  { code: "CO", name: "Comp-off", yearlyQuota: 0, isPaid: true, carryForward: false, maxCarryForward: 0 },
];

/** Deterministic PRNG so every seed produces the same demo month. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function reset() {
  // Children first; this only runs against the seed target database.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.dailyReport.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.attendanceRecord.deleteMany(),
    prisma.importChange.deleteMany(),
    prisma.importBatch.deleteMany(),
    prisma.attendanceRequest.deleteMany(),
    prisma.leaveBalance.deleteMany(),
    prisma.leaveType.deleteMany(),
    prisma.shiftAssignment.deleteMany(),
    prisma.weeklyOffRule.deleteMany(),
    prisma.shiftDay.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.employee.updateMany({ data: { managerId: null } }),
    prisma.employee.deleteMany(),
    prisma.user.deleteMany(),
    prisma.accessRole.deleteMany(),
    prisma.department.deleteMany(),
    prisma.designation.deleteMany(),
    prisma.companySetting.deleteMany(),
  ]);
}

async function main() {
  await reset();

  await prisma.companySetting.createMany({
    data: [
      { key: "company", value: { name: "Demo Studio Pvt Ltd", address: "Avinashi Road, Coimbatore, Tamil Nadu 641018", logoPath: null } },
      { key: "geofence", value: { enabled: false, lat: 11.0168, lng: 76.9558, radiusMeters: 200 } },
      { key: "punch", value: { selfieRequired: false } },
      { key: "caps", value: { wfhPerMonth: 4, permissionPerMonth: 2, permissionMaxMinutes: 120 } },
    ],
  });

  // Mon–Fri 9:30–6:30 (8 h minimum), Saturday 9:30–5:30 (7 h minimum).
  const shift = await prisma.shift.create({
    data: {
      name: "General",
      isDefault: true,
      graceMinutes: 15,
      fullDayMinutes: 480,
      halfDayMinutes: 240,
      earlyLeaveMinutes: 15,
      overtimeAfterMinutes: 30,
      days: {
        create: [
          ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:30", endTime: "18:30" })),
          { weekday: 6, startTime: "09:30", endTime: "17:30", fullDayMinutes: 420 },
        ],
      },
    },
  });

  await prisma.weeklyOffRule.create({
    data: { effectiveFrom: ymdToDb("2026-01-01"), pattern: SATURDAY_POLICIES.ALT_2_4.pattern, label: SATURDAY_POLICIES.ALT_2_4.label },
  });

  await prisma.holiday.createMany({ data: HOLIDAYS_2026.map(([date, name, type]) => ({ date: ymdToDb(date), name, type })) });

  const leaveTypes = await Promise.all(LEAVE_TYPES.map((data) => prisma.leaveType.create({ data })));

  // Access roles: the three built-ins (same as the migration creates) and one custom role.
  const roles = {
    SUPER_ADMIN: await prisma.accessRole.create({ data: { ...SYSTEM_ROLES.SUPER_ADMIN, permissions: [...SYSTEM_ROLES.SUPER_ADMIN.permissions], systemKey: "SUPER_ADMIN" } }),
    HR: await prisma.accessRole.create({ data: { ...SYSTEM_ROLES.HR, permissions: [...SYSTEM_ROLES.HR.permissions], systemKey: "HR" } }),
    EMPLOYEE: await prisma.accessRole.create({ data: { ...SYSTEM_ROLES.EMPLOYEE, permissions: [...SYSTEM_ROLES.EMPLOYEE.permissions], systemKey: "EMPLOYEE" } }),
  };
  const teamLead = await prisma.accessRole.create({ data: TEAM_LEAD });

  const admin = await prisma.user.create({
    data: {
      name: "Suresh Babu",
      username: "admin",
      email: "admin@example.com",
      phone: "9876500000",
      passwordHash: await bcrypt.hash("admin", 10),
      role: "SUPER_ADMIN",
      accessRoleId: roles.SUPER_ADMIN.id,
      mustChangePassword: false,
    },
  });

  const employees = [];
  for (const p of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        name: p.fullName,
        email: p.email,
        phone: p.phone,
        passwordHash: await bcrypt.hash(p.password, 10),
        // The legacy column stays EMPLOYEE for custom roles (as assignAccessRole does).
        role: p.role,
        accessRoleId: p.code === "EMP003" ? teamLead.id : roles[p.role].id,
        mustChangePassword: false,
      },
    });
    const emp = await prisma.employee.create({
      data: {
        code: p.code,
        fullName: p.fullName,
        phone: p.phone,
        email: p.email,
        joiningDate: ymdToDb(p.joined),
        dateOfBirth: "dob" in p && p.dob ? ymdToDb(p.dob) : null,
        user: { connect: { id: user.id } },
        department: { connectOrCreate: { where: { name: p.dept }, create: { name: p.dept } } },
        designation: { connectOrCreate: { where: { name: p.desig }, create: { name: p.desig } } },
        shifts: { create: { shiftId: shift.id, effectiveFrom: ymdToDb(p.joined) } },
      },
    });
    employees.push({ ...emp, joined: p.joined });
  }
  // Everyone reports to the HR manager except the HR manager, and Anitha and Divya, who report
  // to Karthik (Team Lead).
  const karthik = employees.find((e) => e.code === "EMP003")!;
  await prisma.employee.updateMany({ where: { code: { notIn: ["EMP001", "EMP002", "EMP006"] } }, data: { managerId: employees[0]!.id } });
  await prisma.employee.updateMany({ where: { code: { in: ["EMP002", "EMP006"] } }, data: { managerId: karthik.id } });

  // One pinned notice on the board (no end date, so it shows whenever the seed is used).
  await prisma.announcement.create({
    data: {
      title: "Deepavali sweets & early leave on Friday",
      body: [
        "Happy Deepavali in advance, everyone!",
        "",
        "Sweet boxes will be handed out at the reception on Friday from 3 PM. The office closes at 4:30 PM that day so you can get home before the traffic.",
        "",
        "Remember: Sunday 08 Nov is a holiday.",
      ].join("\n"),
      pinned: true,
      createdById: admin.id,
    },
  });

  await prisma.leaveBalance.createMany({
    data: employees.flatMap((e) =>
      leaveTypes.map((lt) => ({ employeeId: e.id, leaveTypeId: lt.id, year: 2026, allotted: lt.yearlyQuota, carriedForward: lt.code === "EL" ? 4 : 0, used: 0 })),
    ),
  });

  // Demo punches: 1 Oct 2026 up to yesterday (IST), on working days only.
  const holidays = new Set(HOLIDAYS_2026.map(([d]) => d));
  const rules = [{ shiftId: null, effectiveFrom: "2026-01-01", pattern: SATURDAY_POLICIES.ALT_2_4.pattern }];
  const rand = mulberry32(2026);
  const today = istDate();
  const last = addDays(today < "2026-11-04" ? "2026-11-04" : today, -1);
  const dates: string[] = [];
  for (let d = "2026-10-01"; d <= last && d < today; d = addDays(d, 1)) dates.push(d);

  const rows = [];
  for (const d of dates) {
    if (holidays.has(d) || isWeeklyOff(rules, d, null)) continue;
    const saturday = new Date(`${d}T00:00:00Z`).getUTCDay() === 6;
    for (const e of employees) {
      if (d < e.joined) continue;
      const r = rand();
      if (r < 0.05) continue; // absent
      const inMin = 9 * 60 + 15 + Math.floor(rand() * (r < 0.2 ? 55 : 28)); // 9:15–10:10, mostly before 9:45
      const outBase = saturday ? 17 * 60 + 30 : 18 * 60 + 30;
      const outMin = outBase - 10 + Math.floor(rand() * 75);
      const halfDay = r > 0.97;
      const missingOut = r > 0.955 && r <= 0.97;
      rows.push({
        employeeId: e.id,
        date: ymdToDb(d),
        punchInAt: istAt(d, minutesToHhmm(inMin)),
        punchOutAt: missingOut ? null : istAt(d, minutesToHhmm(halfDay ? inMin + 300 : outMin)),
        source: "WEB" as const,
      });
    }
  }
  await prisma.attendanceRecord.createMany({ data: rows });
  for (const d of dates) await closeDay(d);

  console.log(`Seeded ${employees.length} employees, ${rows.length} punched days over ${dates.length} dates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
