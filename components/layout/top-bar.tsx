"use client";

import { KeyRound, LogOut, Monitor, Moon, Sun, UserPen } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { logout } from "@/lib/actions/auth";
import type { NavAccess } from "@/lib/palette";
import { initials } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { InstallAppItem } from "./install-app";
import { NotificationBell, type BellItem } from "./notification-bell";
import { ProfileDialog } from "./profile-dialog";

/** `access` is optional: without it the command palette asks the server once when first opened. */
export function TopBar({ name, email, notifications, access }: { name: string; email: string; notifications: BellItem[]; access?: NavAccess }) {
  const { theme, setTheme } = useTheme();
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 px-3 backdrop-blur-xl [background:color-mix(in_srgb,var(--ad-canvas)_55%,transparent)] sm:px-5">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      <Breadcrumbs />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <div className="mr-1">
          <CommandPalette access={access} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${theme ?? "system"}`}
          onClick={() => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")}
        >
          <ThemeIcon />
        </Button>
        <NotificationBell items={notifications} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="ml-1 h-9 gap-2 rounded-full px-1 sm:pr-3" aria-label="Account menu">
              <Avatar className="size-7">
                <AvatarFallback className="bg-brand text-[11px] font-semibold text-brand-foreground">{initials(name)}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-36 truncate text-sm font-medium sm:block">{name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <InstallAppItem />
            <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
              <UserPen /> Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/change-password">
                <KeyRound /> Change password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} name={name} email={email} />
      </div>
    </header>
  );
}
