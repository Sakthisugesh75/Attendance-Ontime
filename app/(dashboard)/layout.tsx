import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ReminderPopup } from "@/components/layout/reminder-popup";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { formatDate, formatTime, istDate } from "@/lib/time";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [company, notifications, cookieStore] = await Promise.all([
    getSetting("company"),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    cookies(),
  ]);
  // Only what navigation needs; pages and actions re-check permissions on the server.
  const access = { isSuperAdmin: user.isSuperAdmin, permissions: user.permissions, hasEmployee: !!user.employeeId, writesReports: user.writesReports };
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar company={company.name} logo={company.logoPath ? `/api/files/${company.logoPath}` : null} access={access} roleName={user.roleName} />
      <SidebarInset className="min-w-0 bg-transparent">
        <TopBar
          access={access}
          name={user.name}
          email={user.email}
          notifications={notifications.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            read: n.readAt !== null,
            when: `${formatDate(istDate(n.createdAt)).slice(0, 6)}, ${formatTime(n.createdAt)}`,
          }))}
        />
        {/* Bottom padding on phones keeps content clear of the tab bar. */}
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-[calc(6.5rem+var(--inset-bottom))] sm:px-6 md:pb-8 lg:px-8 lg:py-8">{children}</div>
        <BottomNav access={access} />
        <ReminderPopup />
      </SidebarInset>
    </SidebarProvider>
  );
}
