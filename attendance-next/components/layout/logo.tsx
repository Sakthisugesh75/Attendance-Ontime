import { cn } from "@/lib/utils";

/** Brand mark: a clock face on an ink circle (matches the PWA icon). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-brand text-on-brand", className)}>
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    </span>
  );
}
