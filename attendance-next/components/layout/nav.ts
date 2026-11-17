import {
  BarChart3,
  CalendarDays,
  CalendarHeart,
  FileSpreadsheet,
  Grid3x3,
  Inbox,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/access/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission needed to see the page; none = everyone signed in. */
  perm?: Permission;
  /** Also (or only, without `perm`) shown to people with an employee record / who write daily reports. */
  needs?: "employee" | "reports";
  /** Words the command palette also matches */
  keywords?: string;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview punch" },
      { href: "/attendance", label: "My attendance", icon: CalendarDays, needs: "employee", keywords: "history calendar days" },
      { href: "/requests", label: "Requests", icon: Inbox, needs: "employee", perm: "requests.approve", keywords: "leave wfh permission on duty regularization approvals" },
      { href: "/daily-reports", label: "Daily reports", icon: NotebookPen, needs: "reports", perm: "dailyreports.review", keywords: "work update eod end of day tasks status report" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/employees", label: "Employees", icon: Users, perm: "employees.view", keywords: "staff team members" },
      { href: "/muster", label: "Muster roll", icon: Grid3x3, perm: "attendance.view", keywords: "monthly grid register edit attendance" },
      { href: "/holidays", label: "Holidays", icon: CalendarHeart, keywords: "calendar festival" },
      { href: "/announcements", label: "Announcements", icon: Megaphone, keywords: "notice board news circular birthday" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, perm: "reports.view", keywords: "export excel pdf payroll late overtime" },
      { href: "/import", label: "Import Excel", icon: FileSpreadsheet, perm: "import.run", keywords: "upload old log" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, perm: "settings.manage", keywords: "company shifts weekly off leave types geofence" },
      { href: "/access", label: "Access & roles", icon: ShieldCheck, perm: "access.manage", keywords: "permissions roles users sign in activity online" },
      { href: "/audit-log", label: "Audit log", icon: ScrollText, perm: "audit.view", keywords: "history changes who" },
    ],
  },
];
