import { CircleCheck, CircleX, ClockAlert, Hourglass, Link2Off, Timer, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { StatCard } from "@/components/attendance/stat-card";
import { StatusChip } from "@/components/attendance/status-chip";
import { MonthSwitcher } from "@/components/layout/month-switcher";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CalendarDay } from "@/lib/attendance/dashboard";
import { monthView } from "@/lib/attendance/service";
import { prisma } from "@/lib/prisma";
import { hasPermission, requireUser, scopeEmployeeIds } from "@/lib/session";
import { formatDate, formatDuration, formatTime, istDate, monthDates, monthLabel, WEEKDAYS, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EmployeePicker } from "./employee-picker";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; employee?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const today = istDate();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7);
  const canView = hasPermission(user, "attendance.view");

  // Everyone sees themselves; attendance.view can pick anyone in their reach.
  const reach = canView ? await scopeEmployeeIds(user) : [];
  const employees = canView
    ? await prisma.employee.findMany({
        where: { deletedAt: null, ...(reach && { id: { in: reach } }) },
        select: { id: true, fullName: true, code: true },
        orderBy: { fullName: "asc" },
      })
    : [];
  const manager = employees.some((e) => e.id !== user.employeeId);
  const requested = manager && params.employee ? Number(params.employee) : user.employeeId;
  // A hand-typed ?employee= outside the viewer's reach is treated as not found.
  if (requested !== null && requested !== user.employeeId && !employees.some((e) => e.id === requested)) notFound();
  const employeeId = requested ?? employees[0]?.id ?? null;
  if (!employeeId) {
    return (
      <div className="space-y-6">
        <PageHeader title="My attendance" />
        <section className="rounded-xl bg-surface shadow-card">
          <EmptyState icon={Link2Off} title="Not linked to an employee yet">
            Your sign-in isn&apos;t linked to an employee record yet. Ask HR to link it.
          </EmptyState>
        </section>
      </div>
    );
  }
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, fullName: true, code: true } });
  if (!employee) notFound();

  const days = await monthView(employee.id, monthDates(month));
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
  const shown = days.filter((d) => d.date <= today).reverse();
  const totals = {
    present: days.filter((d) => d.status && ["PRESENT", "LATE", "HALF_DAY", "WFH", "ON_DUTY", "PERMISSION"].includes(d.status)).length,
    late: days.filter((d) => d.lateMinutes > 0).length,
    absent: days.filter((d) => d.status === "ABSENT").length,
    worked: days.reduce((s, d) => s + (d.record?.punchOutAt ? d.workedMinutes : 0), 0),
    overtime: days.reduce((s, d) => s + d.overtimeMinutes, 0),
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        title={manager && employee.id !== user.employeeId ? employee.fullName : "My attendance"}
        description={
          <span className="tabular-nums">
            <span className="[font-feature-settings:'zero']">{employee.code}</span> · {monthLabel(month)}
          </span>
        }
        actions={
          <>
            {manager && <EmployeePicker employees={employees} value={employee.id} month={month} />}
            <MonthSwitcher month={month} current={today.slice(0, 7)} max={today.slice(0, 7)} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={CircleCheck} label="Days present" value={String(totals.present)} hint="Incl. WFH, on duty, half days" tone="present" />
        <StatCard icon={ClockAlert} label="Late" value={String(totals.late)} hint="Days after the late mark" tone="late" />
        <StatCard icon={CircleX} label="Absent" value={String(totals.absent)} hint={monthLabel(month)} tone="absent" />
        <StatCard icon={Hourglass} label="Hours worked" value={formatDuration(totals.worked)} hint="Completed days" />
        <StatCard icon={Timer} label="Overtime" value={formatDuration(totals.overtime)} hint={monthLabel(month)} className="max-sm:col-span-2" />
      </div>

      <MonthCalendar month={month} days={calendar} title="Calendar" />

      <Panel title="Day by day" description="Newest first" bodyClassName="p-0">
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-body text-ink-2">No days yet this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-6">Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[88px] text-right">In</TableHead>
                  <TableHead className="w-[88px] text-right">Out</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead className="text-right">Late by</TableHead>
                  <TableHead className="pr-4 text-right sm:pr-6">Overtime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((d) => (
                  <TableRow key={d.date} className={cn("hover:bg-sunken", d.date === today && "bg-brand-subtle/50", d.status === "HOLIDAY" || d.status === "WEEKLY_OFF" ? "text-ink-3" : "text-ink-2")}>
                    <TableCell className="pl-4 whitespace-nowrap sm:pl-6">
                      <span className="font-medium text-ink tabular-nums">{formatDate(d.date)}</span>
                      <span className="ml-2 text-caption text-ink-3">{WEEKDAYS[weekdayOf(d.date)]!.slice(0, 3)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={d.status} label={d.holiday && d.status === "HOLIDAY" ? d.holiday : undefined} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{d.record?.punchInAt ? formatTime(d.record.punchInAt) : <Dash />}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {d.record?.punchOutAt ? (
                        formatTime(d.record.punchOutAt)
                      ) : d.record?.punchInAt ? (
                        <span className="inline-flex items-center gap-1 font-medium text-danger">
                          <TriangleAlert aria-hidden className="size-3.5" />
                          Missing
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.workedMinutes ? formatDuration(d.workedMinutes) : <Dash />}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", d.lateMinutes && "font-semibold text-st-late-fg")}>{d.lateMinutes ? `+${d.lateMinutes}m` : <Dash />}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums sm:pr-6">{d.overtimeMinutes ? formatDuration(d.overtimeMinutes) : <Dash />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Empty value in a table cell (DESIGN.md §4.2). */
function Dash() {
  return <span className="text-ink-3">—</span>;
}
