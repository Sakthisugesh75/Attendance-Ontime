import { CalendarCheck, Hourglass, Inbox, LogIn, Timer } from "lucide-react";
import { StatCard } from "@/components/attendance/stat-card";
import { TeamToday } from "@/components/attendance/team-today";
import { MonthSwitcher } from "@/components/layout/month-switcher";
import { Panel } from "@/components/layout/page-header";
import type { teamToday } from "@/lib/attendance/dashboard";
import type { Overview } from "@/lib/attendance/overview";
import { formatClock, formatDate, formatDuration, monthLabel } from "@/lib/time";
import { AttentionPanel } from "./attention-panel";
import { HoursHeatmap, LateByEmployeeChart, MixDonut, TrendChart } from "./overview-charts";

const BODY = "px-4 py-4 sm:px-6 sm:py-5";

/** Organisation-wide dashboard for HR and the Super Admin (DESIGN.md §5.3). */
export function OrgOverview({ overview, team, currentMonth }: { overview: Overview; team: Awaited<ReturnType<typeof teamToday>> | null; currentMonth: string }) {
  const { stats, month } = overview;
  const isCurrent = month === currentMonth;
  const soFar = isCurrent ? `1–${Number(overview.until.slice(8))} ${monthLabel(month).slice(0, 3)}` : monthLabel(month);

  return (
    <div className="space-y-6">
      {team && (
        <div className="rise" style={{ "--i": 1 } as React.CSSProperties}>
          <TeamToday team={team} />
        </div>
      )}

      <div className="rise space-y-3" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-title-2 text-ink">{monthLabel(month)}</h3>
            <p className="text-caption text-ink-3 tabular-nums">
              {overview.employees} employees · {isCurrent ? `so far this month (${soFar})` : "full month"}
            </p>
          </div>
          <MonthSwitcher month={month} current={currentMonth} max={currentMonth} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={CalendarCheck} label="Attendance" value={stats.attendancePct !== null ? `${stats.attendancePct}%` : "—"} hint="Worked / expected days" tone="present" />
          <StatCard icon={Timer} label="Punctuality" value={stats.punctualityPct !== null ? `${stats.punctualityPct}%` : "—"} hint="On time / days punched in" />
          <StatCard icon={LogIn} label="Avg in-time" value={stats.avgInMinutes !== null ? formatClock(stats.avgInMinutes) : "—"} hint={soFar} />
          <StatCard icon={Hourglass} label="Avg hours / day" value={stats.avgWorkedMinutes !== null ? formatDuration(stats.avgWorkedMinutes) : "—"} hint="Completed days" />
          <StatCard icon={Inbox} label="Pending approvals" value={String(stats.pendingApprovals)} hint="Leave, WFH & permission" tone="pending" className="col-span-2 md:col-span-1" />
        </div>
      </div>

      <div className="rise grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]" style={{ "--i": 3 } as React.CSSProperties}>
        <Panel title="Daily attendance" description={`People present each working day · ${monthLabel(month)}`} bodyClassName={BODY}>
          <TrendChart data={overview.trend} until={overview.until} />
        </Panel>
        <Panel title="Leave, absence & remote" description="Days by type" bodyClassName={BODY}>
          <MixDonut data={overview.mix} />
        </Panel>
      </div>

      <div className="rise grid gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3" style={{ "--i": 4 } as React.CSSProperties}>
        <Panel title="Late arrivals by employee" description="Days arrived after shift start + grace" bodyClassName={BODY}>
          <LateByEmployeeChart data={overview.lateByEmployee} />
        </Panel>
        <Panel title="Working hours" description="Team average per day, completed punches" bodyClassName={BODY}>
          <HoursHeatmap data={overview.hours} />
        </Panel>
        <Panel
          className="lg:col-span-2 xl:col-span-1"
          title="Needs attention"
          description={`${monthLabel(month)}${isCurrent ? ` · up to ${formatDate(overview.until)}` : ""}`}
        >
          <AttentionPanel attention={overview.attention} month={month} />
        </Panel>
      </div>
    </div>
  );
}
