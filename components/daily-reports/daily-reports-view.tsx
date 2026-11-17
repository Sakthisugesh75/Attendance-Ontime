"use client";

import { Download, NotebookPen } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MyReportsData, TeamDay } from "@/lib/daily-reports";
import { addDays, formatDate, monthDates } from "@/lib/time";
import { MyReports } from "./my-reports";
import { TeamReports } from "./team-reports";

export interface DailyReportsViewProps {
  view: "mine" | "team";
  /** Reviewer who also has an employee record: both tabs */
  showTabs: boolean;
  today: string;
  mine: { data: MyReportsData; initialDate: string } | null;
  team: { day: TeamDay; currentEmployeeId: number | null; isSuperAdmin: boolean } | null;
}

export function DailyReportsView({ view, showTabs, today, mine, team }: DailyReportsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startNav] = useTransition();

  const switchView = (v: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("date");
    if (v === "team") next.set("view", "team");
    else next.set("view", "mine");
    startNav(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  const description =
    view === "team" && team
      ? team.day.stats.awaitingReview
        ? `${team.day.stats.awaitingReview} waiting for review · ${team.day.stats.missing} not sent for ${formatDate(team.day.date)}`
        : `End-of-day updates from your team · ${formatDate(team.day.date)}`
      : "A minute at the end of the day: what you did, what's next and what's in your way.";

  const exportUrl = (from: string, to: string) => `/api/export/daily-reports?from=${from}&to=${to}`;
  const month = monthDates(today.slice(0, 7));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={view === "team" ? "Team reports" : "Daily report"}
        title="Daily reports"
        description={description}
        actions={
          view === "team" &&
          team && (
            <>
            {showTabs && (
              <Button variant="mint" onClick={() => switchView("mine")}>
                <NotebookPen /> Write my report
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Excel · one row per task</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={exportUrl(team.day.date, team.day.date)} download>
                    {formatDate(team.day.date)}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportUrl(addDays(today, -6), today)} download>
                    Last 7 days
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportUrl(month[0]!, today)} download>
                    This month so far
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          )
        }
      />

      {showTabs && (
        <Tabs value={view} onValueChange={switchView}>
          <TabsList>
            <TabsTrigger value="mine" className="px-3">
              My reports
            </TabsTrigger>
            <TabsTrigger value="team" className="px-3">
              Team
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {view === "mine" && mine && <MyReports data={mine.data} initialDate={mine.initialDate} />}
      {view === "team" && team && <TeamReports day={team.day} today={today} currentEmployeeId={team.currentEmployeeId} isSuperAdmin={team.isSuperAdmin} />}
    </div>
  );
}
