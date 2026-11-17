import { ArrowRight, Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { Illustration, REQUEST_ART } from "@/components/ui/illustration";
import { EmptyState, Panel } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getBalances, latestRequests } from "@/lib/requests";
import { istDate } from "@/lib/time";
import { fmtNum } from "@/lib/validations/requests";
import { RequestStatusChip, RequestTypeChip } from "./request-chips";
import { requestWhen } from "./request-meta";

/**
 * Dashboard card for the signed-in employee: paid leave balances, the latest three
 * requests and a "New request" shortcut. Server component; pass the employee id.
 */
export async function RequestsSummaryCard({ employeeId }: { employeeId: number }) {
  const year = Number(istDate().slice(0, 4));
  const [balances, latest] = await Promise.all([getBalances(employeeId, year), latestRequests(employeeId, 3)]);
  // Paid types people actually have, plus unpaid ones only once used.
  const shown = balances.filter((b) => (b.isPaid ? b.allotted + b.carriedForward > 0 || b.used > 0 : b.used > 0 || b.pending > 0));

  return (
    <Panel
      title="Leave & requests"
      description={`Balance for ${year}`}
      actions={
        <Button size="sm" asChild>
          <Link href="/requests?new=LEAVE">
            <Plus /> New request
          </Link>
        </Button>
      }
      bodyClassName="p-0"
    >
      {shown.length > 0 && (
        <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
          {shown.slice(0, 3).map((b) => (
            <div key={b.leaveTypeId} className="px-4 py-3.5 sm:px-5">
              <dt className="truncate text-label text-ink-2" title={b.name}>
                {b.code}
              </dt>
              <dd className="mt-1 text-title-1 text-ink tabular-nums">
                {fmtNum(b.isPaid ? b.available : b.used)}
                <span className="ml-1 text-caption font-medium tracking-normal text-ink-3">{b.isPaid ? "left" : "taken"}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {latest.length === 0 ? (
        <EmptyState icon={Inbox} art="mailbox" title="No requests yet">
          Apply for leave, WFH, permission or on duty from here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {latest.map((r) => (
            <li key={r.id} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
              <Illustration name={REQUEST_ART[r.type]} size={40} />
              <div className="min-w-0 flex-1">
                <RequestTypeChip type={r.type} label={r.leaveType?.name} />
                <p className="mt-1 truncate text-body font-medium text-ink tabular-nums">{requestWhen(r)}</p>
              </div>
              <RequestStatusChip status={r.status} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}

      <Link href="/requests" className="flex min-h-11 items-center justify-between border-t border-line px-4 py-3 text-label text-brand-ink transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none sm:px-5">
        All requests
        <ArrowRight className="size-4" />
      </Link>
    </Panel>
  );
}
