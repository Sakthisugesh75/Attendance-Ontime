import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-xl bg-surface shadow-card px-6 py-10 text-center">
        <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-sunken">
          <WifiOff className="size-8 text-ink-3" />
        </span>
        <h1 className="mt-4 text-m-section text-ink">You&apos;re offline</h1>
        <p className="mt-2 text-m-meta font-normal text-ink-2">
          Punches are recorded with the server&apos;s time, so you need a connection to punch in or out. Reconnect and try again.
        </p>
      </div>
    </main>
  );
}
