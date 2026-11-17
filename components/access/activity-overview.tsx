import { ArrowUpRight, LogIn, ScrollText, ShieldAlert, Wifi } from "lucide-react";
import Link from "next/link";
import { ActionBadge } from "@/components/audit/audit-log-view";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { EmptyState, Panel } from "@/components/layout/page-header";
import type { ActivityOverview } from "@/lib/access/queries";
import * as T from "@/components/reports/table-styles";
import { cn } from "@/lib/utils";
import { OnlineDot } from "./presence";

function Stat({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface shadow-card p-4">
      <p className="flex items-center gap-2 text-label text-ink-2">
        {accent && value > 0 && <OnlineDot />}
        {label}
      </p>
      <p className="mt-1 text-display text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-caption text-ink-3">{sub}</p>}
    </div>
  );
}

export function ActivityOverviewView({ data }: { data: ActivityOverview }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Online now" value={data.online.length} sub="Used the app in the last 5 minutes" accent />
        <Stat label="Sign-ins today" value={data.signIns.length} sub={`${data.signInPeople} ${data.signInPeople === 1 ? "person" : "people"}`} />
        <Stat label="Failed sign-ins · 7 days" value={data.failedTotal} sub="Wrong passwords, unknown accounts, lockouts" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Online now" description="Anyone whose last click was within 5 minutes">
          {data.online.length === 0 ? (
            <EmptyState icon={Wifi} title="Nobody is online right now" />
          ) : (
            <ul className="divide-y divide-line">
              {data.online.map((u) => (
                <li key={u.id}>
                  <Link href={`/access/users/${u.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-sunken sm:px-6">
                    <span className="relative shrink-0">
                      <EmployeeAvatar name={u.name} photo={u.photo} />
                      <OnlineDot className="absolute -right-0.5 -bottom-0.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{u.name}</span>
                      <span className="block truncate text-caption text-ink-3">{u.role}</span>
                    </span>
                    <span className="text-caption whitespace-nowrap text-ink-3 tabular-nums">{u.seen}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Sign-ins today" description="Successful sign-ins since midnight (IST)">
          {data.signIns.length === 0 ? (
            <EmptyState icon={LogIn} title="No sign-ins yet today" />
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {data.signIns.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
                  <EmployeeAvatar name={s.name} photo={s.photo} className="size-8" />
                  <span className="min-w-0 flex-1">
                    {s.userId ? (
                      <Link href={`/access/users/${s.userId}`} className="block truncate text-body font-medium text-ink hover:underline">
                        {s.name}
                      </Link>
                    ) : (
                      <span className="block truncate text-body font-medium text-ink">{s.name}</span>
                    )}
                    {s.ip && <span className="block tabular-nums text-caption text-ink-3">{s.ip}</span>}
                  </span>
                  <span className="text-cell whitespace-nowrap text-ink-2 tabular-nums">{s.time}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Failed sign-ins · last 7 days"
        description="What was typed, why it failed and from where. Repeated failures from one address may be someone guessing."
        actions={
          <Link href="/audit-log?action=LOGIN_FAILED" className="-my-2 inline-flex items-center gap-1 py-2 text-label text-brand-ink underline-offset-4 hover:underline">
            Audit log <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        }
      >
        {data.failed.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="No failed sign-ins this week" />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-cell text-ink-2" data-testid="failed-sign-ins">
                <thead>
                  <tr className="border-b border-line bg-sunken text-left">
                    <th className={cn(T.th, "pl-6")}>Tried</th>
                    <th className={T.th}>Account</th>
                    <th className={T.th}>Reason</th>
                    <th className={T.th}>IP</th>
                    <th className={cn(T.th, "pr-6 text-right")}>Time (IST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.failed.map((f) => (
                    <tr key={f.id} className="hover:bg-sunken">
                      <td className="max-w-56 truncate px-4 py-3 pl-6 tabular-nums">{f.identifier}</td>
                      <td className="px-4 py-3">
                        {f.userId ? (
                          <Link href={`/access/users/${f.userId}`} className="text-brand-ink hover:underline">
                            {f.name}
                          </Link>
                        ) : (
                          <span className="text-ink-3">No such account</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(f.locked && "font-medium text-danger")}>
                          {f.reason}
                          {f.attempt ? <span className="text-ink-3"> · attempt {f.attempt}</span> : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-3 tabular-nums">{f.ip ?? "—"}</td>
                      <td className="px-4 py-3 pr-6 text-right whitespace-nowrap tabular-nums">{f.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {data.failed.map((f) => (
                <li key={f.id} className="space-y-0.5 px-4 py-3">
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate tabular-nums text-caption">{f.identifier}</span>
                    <span className="tabular-nums shrink-0 text-caption text-ink-3">{f.when}</span>
                  </p>
                  <p className={cn("text-caption", f.locked ? "font-medium text-danger" : "text-ink-3")}>
                    {f.reason}
                    {f.ip ? ` · ${f.ip}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel
        title="Recent changes"
        description="The latest 20 changes anyone made"
        actions={
          <Link href="/audit-log" className="-my-2 inline-flex items-center gap-1 py-2 text-label text-brand-ink underline-offset-4 hover:underline">
            Full audit log <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        }
      >
        {data.changes.length === 0 ? (
          <EmptyState icon={ScrollText} title="No changes recorded yet" />
        ) : (
          <ul className="divide-y divide-line">
            {data.changes.map((c) => (
              <li key={c.id} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-sunken sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <ActionBadge action={c.action} />
                  <span className="min-w-0 truncate text-body">{c.label}</span>
                </span>
                <span className="flex items-center gap-3 text-caption">
                  {c.actorId ? (
                    <Link href={`/audit-log?actor=${c.actorId}`} className="font-medium text-brand-ink underline-offset-4 hover:underline" title={`Everything ${c.actor} did`}>
                      {c.actor}
                    </Link>
                  ) : (
                    <span className="text-ink-3">System</span>
                  )}
                  <span className="tabular-nums whitespace-nowrap text-ink-3" title={c.when}>
                    {c.ago}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
