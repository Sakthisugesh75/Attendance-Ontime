import { NotebookPen } from "lucide-react";
import { DailyReportsView } from "@/components/daily-reports/daily-reports-view";
import { EmptyState, PageHeader, Panel } from "@/components/layout/page-header";
import { myReportsData, teamDay } from "@/lib/daily-reports";
import { hasPermission, requireUser, scopeEmployeeIds } from "@/lib/session";
import { istDate } from "@/lib/time";
import { pageParams } from "@/lib/validations/daily-reports";

export const metadata = { title: "Daily reports" };

export default async function DailyReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = pageParams.parse(await searchParams);
  const reviewer = hasPermission(user, "dailyreports.review");
  const hasEmployee = !!user.employeeId;
  // Writes their own reports: has an employee record and their role (or own setting) asks for them.
  const writer = user.writesReports;
  // Reviewers land on Team; those who also write reports can switch to their own.
  const view: "mine" | "team" = reviewer ? (writer && params.view === "mine" ? "mine" : "team") : "mine";

  if (!reviewer && hasEmployee && !writer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Daily reports" />
        <Panel>
          <EmptyState icon={NotebookPen} art="thumbs" title="No daily report needed">
            Your role doesn&apos;t send daily reports. If that&apos;s wrong, ask HR to switch it on for you.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  if (!reviewer && !hasEmployee) {
    return (
      <div className="space-y-6">
        <PageHeader title="Daily reports" />
        <Panel>
          <EmptyState icon={NotebookPen} title="Not linked to an employee record">
            Ask HR to link your sign-in to your employee record to send daily reports.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const today = istDate();
  const date = params.date && params.date <= today ? params.date : today;
  const [mine, day] = await Promise.all([
    view === "mine" ? myReportsData(user.employeeId!) : null,
    // Reviewers only ever see the employees in their reach.
    view === "team" ? scopeEmployeeIds(user).then((reach) => teamDay(date, reach)) : null,
  ]);

  return (
    <DailyReportsView
      view={view}
      showTabs={reviewer && writer}
      today={today}
      mine={mine ? { data: mine, initialDate: date } : null}
      team={day ? { day, currentEmployeeId: user.employeeId, isSuperAdmin: user.isSuperAdmin } : null}
    />
  );
}
