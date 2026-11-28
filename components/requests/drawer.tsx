"use client";

import { SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * DESIGN.md §4.8 overlay for detail views and forms: a right-hand drawer on desktop (440px for
 * detail, 560px for forms) and a bottom sheet with a drag handle on phones (radius-xl top
 * corners, max 90vh, safe-area inset). Children are the usual header / scroll body / footer;
 * give the scroll body `min-h-0 flex-1 overflow-y-auto` so the header and footer stay put.
 */
export function DrawerContent({
  size = "detail",
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetContent> & { size?: "detail" | "form" }) {
  const mobile = useIsMobile();
  return (
    <SheetContent
      side={mobile ? "bottom" : "right"}
      className={cn(
        "gap-0 border-line bg-raised p-0 text-ink shadow-lg",
        mobile
          ? "max-h-[90dvh] rounded-t-xl pb-(--inset-bottom)"
          : cn("data-[side=right]:w-full", size === "form" ? "data-[side=right]:sm:max-w-[560px]" : "data-[side=right]:sm:max-w-[440px]"),
        className,
      )}
      {...props}
    >
      {mobile && <span aria-hidden className="mx-auto mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-line-strong" />}
      {children}
    </SheetContent>
  );
}

/** Sticky drawer header: title-3 title, caption description, room on the right for the close button. */
export const drawerHeader = "shrink-0 gap-1 border-b border-line px-5 py-4 pr-12 sm:px-6";
export const drawerTitle = "text-title-3 text-ink";
export const drawerDescription = "text-caption text-ink-3 tabular-nums";
/** Sticky drawer footer: actions right-aligned, secondary then primary (DESIGN.md §4.8). */
export const drawerFooter = "shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-line bg-raised px-5 py-3 sm:px-6";
/** Scrollable middle section. */
export const drawerBody = "min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6";
