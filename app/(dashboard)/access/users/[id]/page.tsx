import { ArrowLeft, ArrowUpRight, AtSign, Building2, CalendarClock, KeyRound, Mail, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Presence, SignInStatusBadge } from "@/components/access/presence";
import { UserActions } from "@/components/access/user-actions";
import { UserTimeline } from "@/components/access/user-timeline";
import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { Panel } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getAccessUser, roleOptions, userTimeline } from "@/lib/access/queries";
import { requirePermission } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const u = Number.isInteger(id) && id > 0 ? await getAccessUser(id) : null;
  return { title: u ? `${u.name} · Access` : "Access" };
}

export default async function AccessUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const me = await requirePermission("access.manage");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const page = Math.max(1, Math.min(10_000, Number((await searchParams).page) || 1));

  const [user, roles, timeline] = await Promise.all([getAccessUser(id), roleOptions(), userTimeline(id, page)]);
  if (!user) notFound();

  const details = [
    { icon: AtSign, label: "Username", value: user.username ? `@${user.username}` : null, mono: true },
    { icon: Mail, label: "Email", value: user.email },
    { icon: Phone, label: "Mobile", value: user.phone ? `${user.phone.slice(0, 5)} ${user.phone.slice(5)}` : null, mono: true },
    { icon: Building2, label: "Employee", value: user.code ? `${user.code}${user.department ? ` · ${user.department}` : ""}` : "No employee record", href: user.employeeId ? `/employees/${user.employeeId}` : undefined },
    { icon: CalendarClock, label: "Last sign-in", value: user.lastLogin ? `${user.lastLogin} (${user.lastLoginAgo})` : "Never", mono: true },
    { icon: KeyRound, label: "Password", value: user.mustChangePassword ? "Must choose a new one at next sign-in" : "Set by them" },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="-ml-2 text-ink-2 md:h-8">
        <Link href="/access?tab=users">
          <ArrowLeft /> Users
        </Link>
      </Button>

      <section className="rounded-xl bg-surface shadow-card">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <EmployeeAvatar name={user.name} photo={user.photo} className="size-16" large />
          <div className="min-w-0 flex-1">
            <p className="text-caption text-ink-3">Sign-in account</p>
            <h2 className="mt-0.5 truncate text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink sm:text-title-1">{user.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-sunken pr-2 pl-1.5 text-caption font-semibold text-ink-2">
                <ShieldCheck aria-hidden className="size-3.5" /> {user.roleName}
              </span>
              <SignInStatusBadge status={user.status} lockedUntil={user.lockedUntil} />
              <Presence online={user.online} lastSeenAgo={user.lastSeenAgo} />
            </div>
          </div>
          <UserActions user={user} actor={{ id: me.id, isSuperAdmin: me.isSuperAdmin }} roles={roles} showActivityLink={false} layout="bar" />
        </div>
        <dl className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {details.map((d) => (
            <div key={d.label} className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-6 lg:[&:nth-last-child(-n+3)]:border-b-0">
              <d.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">{d.label}</dt>
                <dd className={d.mono ? "mt-0.5 truncate text-body text-ink tabular-nums" : "mt-0.5 truncate text-body text-ink"}>
                  {d.href ? (
                    <Link href={d.href} className="text-brand-ink underline-offset-4 hover:underline">
                      {d.value}
                    </Link>
                  ) : (
                    (d.value ?? <span className="text-ink-3">—</span>)
                  )}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <Panel
        title="Activity timeline"
        description="Every sign-in, everything they changed and everything done to their account. Times are IST."
        actions={
          <Link href={`/audit-log?actor=${user.id}`} className="-my-2 inline-flex items-center gap-1 py-2 text-label text-brand-ink underline-offset-4 hover:underline">
            In audit log <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        }
      >
        <UserTimeline days={timeline.days} page={timeline.page} pageCount={timeline.pageCount} total={timeline.total} baseHref={`/access/users/${user.id}`} />
      </Panel>
    </div>
  );
}
