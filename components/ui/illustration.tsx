import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * 3D illustrations (Microsoft Fluent 3D, MIT licence; files in /public/illustrations).
 * Decorative only: the words beside them always say the same thing (DESIGN.md §0, "3D art").
 * Use them where people act or wait (quick actions, today's counts, request rows, empty states),
 * never in buttons, the menu or tables.
 */
export const ART = [
  "alarm", "bell", "briefcase", "calendar", "chart", "check", "clipboard", "coffee", "hourglass", "house", "mailbox",
  "memo", "moon", "office", "palm", "party", "rocket", "snail", "stopwatch", "sun", "thumbs", "wave", "zzz",
] as const;
export type ArtName = (typeof ART)[number];

/** One meaning per picture, shared across the app. */
export const REQUEST_ART = { LEAVE: "palm", WFH: "house", PERMISSION: "hourglass", ON_DUTY: "briefcase", REGULARIZATION: "clipboard" } as const satisfies Record<string, ArtName>;

/** `size` is the default box; a size-* class in `className` overrides it per breakpoint. */
export function Illustration({ name, size = 48, float, className }: { name: ArtName; size?: number; float?: boolean; className?: string }) {
  return (
    <Image
      src={`/illustrations/${name}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      unoptimized
      draggable={false}
      className={cn("pointer-events-none shrink-0 object-contain drop-shadow-[0_8px_10px_rgba(80,50,0,0.22)] select-none", float && "art-float", className)}
    />
  );
}
