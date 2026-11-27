import { LiveRefresh } from "@/components/layout/live-refresh";
import { CalendarCheck, CalendarDays, ClockAlert, Hourglass, Link2Off, LogIn } from "lucide-react";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { PunchCard } from "@/components/attendance/punch-card";
import { StatCard } from "@/components/attendance/stat-card";
import { TodayReportCard } from "@/components/daily-reports/today-report-card";
import { AnnouncementsCard } from "@/components/dashboard/announcements-card";
import { CelebrationsCard } from "@/components/dashboard/celebrations-card";
import { OrgOverview } from "@/components/dashboard/org-overview";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { EmptyState } from "@/components/layout/page-header";
import { RequestsSummaryCard } from "@/components/requests/requests-summary-card";
import { Illustration } from "@/components/ui/illustration";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { employeeDashboard, teamToday } from "@/lib/attendance/dashboard";
import { monthOverview } from "@/lib/attendance/overview";
import { hasPermission, requireUser, scopeEmployeeIds } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { formatClock, formatDate, formatDuration, istDate, monthLabel, WEEKDAYS, weekdayOf } from "@/lib/time";

export const metadata = { title: "Dashboard" };

const istHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
/** Waving hand by day, the moon after 7 PM. */
const greetingArt = () => (istHour() >= 19 || istHour() < 5 ? "moon" : "wave");

function greeting() {
  const h = istHour();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
  const user = await requireUser();
  const manager = hasPermission(user, "dashboard.org");
  const params = await searchParams;
  const today = istDate();
  const currentMonth = today.slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") && params.month! <= currentMonth ? params.month! : currentMonth;

  const reach = manager ? await scopeEmployeeIds(user) : [];
  const [mine, overview, team, geofence, punch] = await Promise.all([
    user.employeeId ? employeeDashboard(user.employeeId) : null,
    manager ? monthOverview(month, reach) : null,
    manager && month === currentMonth ? teamToday(reach) : null,
    getSetting("geofence"),
    getSetting("punch"),
  ]);
  const firstName = user.name.split(" ")[0];

  const myDay = mine && (
    <div className="space-y-6 lg:space-y-8">
      <LiveRefresh seconds={60} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <PunchCard today={mine.today} geofenceEnabled={geofence.enabled} selfieRequired={punch.selfieRequired} writesReports={user.writesReports} />
        <QuickActions stacked writesReports={user.writesReports} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={LogIn} label="Avg in-time" value={mine.stats.avgInMinutes !== null ? formatClock(mine.stats.avgInMinutes) : "—"} hint={monthLabel(mine.month)} />
        <StatCard icon={Hourglass} label="Avg hours / day" value={mine.stats.avgWorkedMinutes !== null ? formatDuration(mine.stats.avgWorkedMinutes) : "—"} hint="Completed days" />
        <StatCard icon={ClockAlert} label="Late arrivals" value={String(mine.stats.lateCount)} hint="This month" tone="late" />
        <StatCard icon={CalendarCheck} label="Days present" value={`${mine.stats.presentDays}/${mine.stats.workingDaysSoFar}`} hint="Working days so far" tone="present" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
        <MonthCalendar month={mine.month} days={mine.calendar} />
        <div className="flex flex-col gap-4">
          {user.writesReports && <TodayReportCard employeeId={user.employeeId!} />}
          <RequestsSummaryCard employeeId={user.employeeId!} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="rise flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Illustration name={greetingArt()} size={44} float className="size-11 sm:size-16" />
          <div className="min-w-0">
          <h2 className="text-m-title text-ink sm:text-[32px] sm:leading-10 sm:tracking-[-0.025em]">
            {greeting()}, {firstName}
          </h2>
          <p className="mt-1 text-m-meta text-ink-2 sm:text-body">{user.roleName}</p>
          </div>
        </div>
        <span className="glass inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-ink tabular-nums">
          <CalendarDays aria-hidden className="size-4 text-ink-3" />
          {WEEKDAYS[weekdayOf(today)]?.slice(0, 3)}, {formatDate(today).slice(0, 6)}
        </span>
      </div>

      {overview ? (
        myDay ? (
          <Tabs defaultValue={params.tab === "me" ? "me" : "overview"}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="me">My day</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-5">
              <OrgOverview overview={overview} team={team} currentMonth={currentMonth} />
            </TabsContent>
            <TabsContent value="me" className="mt-5">
              {myDay}
            </TabsContent>
          </Tabs>
        ) : (
          <OrgOverview overview={overview} team={team} currentMonth={currentMonth} />
        )
      ) : myDay ? (
        myDay
      ) : (
        <section className="rounded-xl bg-surface shadow-card">
          <EmptyState icon={Link2Off} title="Not linked to an employee yet">
            Your sign-in isn&apos;t linked to an employee record yet. Ask HR to link it so you can punch in.
          </EmptyState>
        </section>
      )}

      {/* Company-wide: the same for everyone */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <AnnouncementsCard />
        <CelebrationsCard />
      </div>
    </div>
  );
}
