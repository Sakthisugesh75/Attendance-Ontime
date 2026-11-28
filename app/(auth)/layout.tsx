/**
 * Sign-in screens (DESIGN.md §0, v4 glass): a frosted card on the warm canvas, under a glossy
 * clock with two small glass badges. The same layout on phones and desktops.
 */
function ClockOrb() {
  return (
    <div aria-hidden className="relative mx-auto mb-6 h-[150px] w-[300px]">
      <div className="glass absolute top-12 left-1 grid size-[76px] -rotate-[10deg] place-items-center rounded-[24px] text-center">
        <div>
          <b className="block text-[21px] leading-none font-medium tabular-nums">9:30</b>
          <small className="text-[10.5px] text-ink-3">shift starts</small>
        </div>
      </div>
      <div className="absolute top-1 left-1/2 grid size-[118px] -translate-x-1/2 -rotate-6 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,color-mix(in_srgb,var(--ad-mint)_45%,#fff)_58%,var(--ad-mint))] shadow-[0_22px_44px_-14px_rgba(160,110,0,0.55),inset_0_-6px_16px_rgba(160,110,0,0.25)]">
        <svg viewBox="0 0 24 24" className="size-[68px] text-on-butter" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      </div>
      <div className="glass absolute top-8 right-1 grid size-[76px] rotate-[9deg] place-items-center rounded-[24px] text-center">
        <div>
          <b className="block text-[21px] leading-none font-medium">IST</b>
          <small className="text-[10.5px] text-ink-3">server time</small>
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[calc(2.5rem+var(--inset-top))] pb-[calc(2.5rem+var(--inset-bottom))] sm:px-8">
      <div className="rise w-full max-w-[420px]">
        <ClockOrb />
        <div className="glass rounded-xl px-5 py-7 sm:px-8 sm:py-8">{children}</div>
        <p className="mt-5 text-center text-caption text-ink-3">All times in India Standard Time</p>
      </div>
    </main>
  );
}
