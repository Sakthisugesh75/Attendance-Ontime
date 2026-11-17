"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { navAllowed, type NavAccess } from "@/lib/palette";
import { Logo } from "./logo";
import { NAV } from "./nav";

const istClock = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/** Live IST time in the sidebar footer: a quiet reminder of whose clock counts. */
function IstClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(istClock.format(new Date()).toUpperCase());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="rounded-lg bg-butter px-4 py-3 text-on-butter group-data-[collapsible=icon]:hidden">
      <span className="block text-[12px] opacity-75">India time</span>
      <span className="block text-[26px] leading-8 font-medium tracking-[-0.02em] tabular-nums">{now ?? "--:--"}</span>
    </div>
  );
}

/** `access` only decides which links show; every page and action checks permissions again on the server. */
export function AppSidebar({ company, logo, access, roleName }: { company: string; logo: string | null; access: NavAccess; roleName: string }) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="pt-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="rounded-full hover:bg-glass">
              <Link href="/dashboard">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="size-8 shrink-0 rounded-lg bg-white object-contain p-0.5" />
                ) : (
                  <Logo className="size-10" />
                )}
                <span className="grid min-w-0 leading-tight">
                  <span className="truncate text-[15px] font-medium text-ink">{company}</span>
                  <span className="truncate text-xs text-ink-3">{roleName}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        {NAV.map((group) => {
          const items = group.items.filter((i) => navAllowed(i, access));
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="px-4 text-[12px] font-medium text-ink-3">{group.label}</SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="relative h-11 rounded-full px-4 text-[14px] font-normal text-ink-2 transition-colors hover:bg-glass hover:text-ink data-[active=true]:bg-brand data-[active=true]:font-medium data-[active=true]:text-on-brand data-[active=true]:shadow-brand data-[active=true]:[&>svg]:text-on-brand data-[active=true]:hover:bg-brand data-[active=true]:hover:text-on-brand"
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="pb-4">
        <IstClock />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
