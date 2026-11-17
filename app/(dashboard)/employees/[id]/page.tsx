import { ArrowLeft, Briefcase, Building2, Cake, CalendarClock, CalendarDays, Camera, CircleCheck, ClipboardPen, Clock, Hourglass, Lock, Mail, MapPin, Phone, TriangleAlert, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { StatusChip } from "@/components/attendance/status-chip";
import { EmployeeActions, PhotoButton } from "@/components/employees/employee-actions";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { EmployeeStatusBadge } from "@/components/employees/employee-status";
import { Button } from "@/components/ui/button";
import type { CalendarDay } from "@/lib/attendance/dashboard";
import { monthView } from "@/lib/attendance/service";
import { employeeFormOptions, getEmployee, recentPunches } from "@/lib/employees";
import { canReachEmployee, hasPermission, requirePermission, scopeEmployeeIds } from "@/lib/session";
import { formatDate, formatDuration, formatTime, istDate, monthDates, WEEKDAYS, weekdayOf } from "@/lib/time";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("employees.view");
  const id = Number((await params).id) || 0;
  // Never put the name of someone outside the viewer's reach in the title.
  const e = (await canReachEmployee(user, id)) ? await getEmployee(id) : null;
  return { title: e?.fullName ?? "Employee" };
}

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("employees.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  // Outside the viewer's reach: back to the dashboard, as for any page they can't open.
  if (!(await canReachEmployee(user, id))) redirect("/dashboard");
  const reach = await scopeEmployeeIds(user);
  const canManage = hasPermission(user, "employees.manage");
  const employee = await getEmployee(id);
  if (!employee) notFound();
  const { edit } = await searchParams;

  const today = istDate();
  const month = today.slice(0, 7);
  const [options, days, punches] = await Promise.all([employeeFormOptions(id, reach), monthView(id, monthDates(month)), recentPunches(id)]);
  const calendar: CalendarDay[] = days.map((v) => ({
    date: v.date,
    status: v.status,
    holiday: v.holiday,
    weeklyOff: v.weeklyOff,
    inTime: v.record?.punchInAt ? formatTime(v.record.punchInAt) : null,
    outTime: v.record?.punchOutAt ? formatTime(v.record.punchOutAt) : null,
    workedMinutes: v.workedMinutes,
    lateMinutes: v.lateMinutes,
    isToday: v.date === today,
    isFuture: v.date > today,
  }));

  const locked = employee.user?.lockedUntil && employee.user.lockedUntil > new Date();
  const details = [
    { icon: Phone, label: "Mobile", value: employee.phone ? `${employee.phone.slice(0, 5)} ${employee.phone.slice(5)}` : null },
    { icon: Mail, label: "Email", value: employee.email || null },
    { icon: Cake, label: "Date of birth", value: employee.dateOfBirth ? formatDate(employee.dateOfBirth) : null },
    { icon: Building2, label: "Department", value: employee.department || null },
    { icon: Briefcase, label: "Designation", value: employee.designation || null },
    { icon: UserRound, label: "Reports to", value: employee.manager ? employee.manager.fullName : null, href: employee.manager && (!reach || reach.includes(employee.manager.id)) ? `/employees/${employee.manager.id}` : undefined },
    { icon: CalendarDays, label: "Joined", value: formatDate(employee.joiningDate) },
    { icon: CalendarClock, label: employee.status === "ON_NOTICE" ? "Last working day" : "Exit date", value: employee.exitDate ? formatDate(employee.exitDate) : null },
    { icon: Clock, label: "Shift", value: employee.shiftHistory.find((s) => s.from <= today && (!s.to || s.to >= today))?.name ?? null },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="-ml-2 h-11 text-ink-2 sm:h-8">
        <Link href="/employees">
          <ArrowLeft /> Employees
        </Link>
      </Button>

      {/* Header */}
      <section className="flex flex-col gap-4 rounded-xl bg-surface shadow-card p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <div className="relative w-fit">
          <EmployeeAvatar name={employee.fullName} photo={employee.photo} className="size-16" large />
          {canManage && <PhotoButton id={employee.id} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink sm:text-title-1">{employee.fullName}</h2>
            <EmployeeStatusBadge status={employee.status} />
          </div>
          <p className="mt-1 text-body text-ink-2">
            <span className="tabular-nums [font-feature-settings:'zero']">{employee.code}</span>
            {employee.designation && ` · ${employee.designation}`}
            {employee.department && ` · ${employee.department}`}
          </p>
        </div>
        {hasPermission(user, "requests.approve") && id !== user.employeeId && (
          <Button variant="outline" asChild className="h-11 w-full sm:h-10 sm:w-fit">
            <Link href={`/requests?record=${id}`}>
              <ClipboardPen /> Record leave / permission
            </Link>
          </Button>
        )}
        {canManage && (
          <EmployeeActions
            employee={employee}
            options={options}
            access={{ canAssignRoles: hasPermission(user, "access.manage"), isSuperAdmin: user.isSuperAdmin, userId: user.id }}
            canManageLogin={
              employee.user?.role === "SUPER_ADMIN"
                ? user.isSuperAdmin
                : employee.user?.accessRole?.systemKey === "EMPLOYEE" || (!employee.user?.accessRole && employee.user?.role === "EMPLOYEE") || hasPermission(user, "access.manage")
            }
            isSelf={employee.user?.id === user.id}
            openEdit={edit === "1"}
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          {/* Details */}
          <section className="rounded-xl bg-surface shadow-card">
            <h3 className="border-b border-line px-4 py-3 text-title-3 text-ink sm:px-5">Details</h3>
            <dl className="divide-y divide-line">
              {details.map((d) => (
                <div key={d.label} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <d.icon aria-hidden className="size-4 shrink-0 text-ink-3" />
                  <dt className="w-28 shrink-0 text-body text-ink-3">{d.label}</dt>
                  <dd className="min-w-0 truncate text-body font-medium text-ink tabular-nums">
                    {d.value ? (
                      d.href ? (
                        <Link href={d.href} className="text-brand-ink hover:underline">
                          {d.value}
                        </Link>
                      ) : (
                        d.value
                      )
                    ) : (
                      <span className="font-normal text-ink-3">—</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Sign-in */}
          <section className="rounded-xl bg-surface shadow-card p-4 sm:p-5">
            <h3 className="text-title-3 text-ink">Sign-in account</h3>
            {employee.user ? (
              <dl className="mt-3 space-y-2.5 text-body">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Status</dt>
                  <dd className="text-right font-medium text-ink">
                    {!employee.user.isActive ? (
                      <span className="text-ink-3">Disabled</span>
                    ) : locked ? (
                      <span className="inline-flex items-center gap-1 text-danger">
                        <Lock aria-hidden className="size-3.5" /> Locked after failed attempts
                      </span>
                    ) : employee.user.mustChangePassword ? (
                      <span className="inline-flex items-center gap-1 text-st-late-fg">
                        <Hourglass aria-hidden className="size-3.5" /> Waiting for first sign-in
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-st-present-fg">
                        <CircleCheck aria-hidden className="size-3.5" /> Active
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Role</dt>
                  <dd className="text-right font-medium text-ink">{employee.user.role === "SUPER_ADMIN" ? "Super Admin" : (employee.user.accessRole?.name ?? "Employee")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Last sign-in</dt>
                  <dd className="text-right font-medium text-ink tabular-nums">{employee.user.lastLoginAt ? `${formatDate(istDate(employee.user.lastLoginAt))}, ${formatTime(employee.user.lastLoginAt)}` : "Never"}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-body text-ink-2">No account. Edit the employee and turn on &ldquo;Can sign in&rdquo; to create one.</p>
            )}
          </section>

          {/* Shift history + team */}
          <section className="rounded-xl bg-surface shadow-card p-4 sm:p-5">
            <h3 className="text-title-3 text-ink">Shift history</h3>
            <ol className="mt-3 space-y-2.5">
              {employee.shiftHistory.map((s, i) => (
                <li key={`${s.from}-${i}`} className="flex items-center gap-3 text-body">
                  <span aria-hidden className={i === 0 ? "size-2 shrink-0 rounded-full bg-ink" : "size-2 shrink-0 rounded-full border border-line-strong"} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{s.name}</span>
                  <span className="text-caption text-ink-3 tabular-nums">
                    {formatDate(s.from)} – {s.to ? formatDate(s.to) : "now"}
                  </span>
                </li>
              ))}
            </ol>
            {employee.reports.length > 0 && (
              <>
                <h3 className="mt-6 flex items-center gap-2 text-label text-ink">
                  <Users aria-hidden className="size-4 text-ink-3" /> Team ({employee.reports.length})
                </h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {employee.reports.map((r) => (
                    <li key={r.id}>
                      {!reach || reach.includes(r.id) ? (
                        <Link href={`/employees/${r.id}`} className="inline-flex h-8 items-center rounded-full border border-line px-3 text-caption text-ink-2 hover:bg-sunken hover:text-ink">
                          {r.fullName}
                        </Link>
                      ) : (
                        <span className="inline-flex h-8 items-center rounded-full border border-line px-3 text-caption text-ink-2">{r.fullName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <MonthCalendar month={month} days={calendar} />

          <section className="overflow-hidden rounded-xl bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <h3 className="text-title-3 text-ink">Recent punches</h3>
              {hasPermission(user, "attendance.view") && (
                <Link href={`/attendance?employee=${employee.id}`} className="-my-2 py-2 text-label text-brand-ink hover:underline">
                  Full history
                </Link>
              )}
            </div>
            {punches.length === 0 ? (
              <p className="px-5 py-10 text-center text-body text-ink-2">No punches yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {punches.map((p) => (
                  <li key={p.date} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-body text-ink-2 hover:bg-sunken sm:px-5">
                    <span className="w-32">
                      <span className="font-medium text-ink tabular-nums">{formatDate(p.date)}</span>
                      <span className="block text-caption text-ink-3">{WEEKDAYS[weekdayOf(p.date)]}</span>
                    </span>
                    <span className="flex-1 tabular-nums">
                      {formatTime(p.punchInAt)} – {p.punchOutAt ? formatTime(p.punchOutAt) : <span className="inline-flex items-center gap-1 text-danger">
                          <TriangleAlert aria-hidden className="size-3.5" /> no punch-out
                        </span>}
                      {p.workedMinutes > 0 && <span className="ml-2 text-caption text-ink-3">{formatDuration(p.workedMinutes)}</span>}
                    </span>
                    <span className="flex items-center gap-2 text-ink-3">
                      {p.hasLocation && <MapPin className="size-3.5" aria-label="Location captured" />}
                      {p.selfieIn && hasPermission(user, "attendance.view") && (
                        <a href={p.selfieIn} target="_blank" rel="noreferrer" aria-label="Punch-in selfie" className="-m-2 p-2 hover:text-ink">
                          <Camera className="size-3.5" />
                        </a>
                      )}
                    </span>
                    <StatusChip status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
