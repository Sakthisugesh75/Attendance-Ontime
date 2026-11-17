"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort boundary when the root layout itself fails. It replaces <html>, so it can't
 * rely on the theme provider or fonts: plain markup on the design tokens (light theme).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(`[global-error] digest=${error.digest ?? "none"}`, error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center bg-canvas px-4 py-10 font-sans text-ink antialiased">
        <main className="w-full max-w-md rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-danger-subtle text-title-2 text-danger">
            !
          </span>
          <p className="mt-4 text-caption text-ink-3">Attendance</p>
          <h1 className="mt-1 text-title-2 text-ink">The app hit an unexpected error</h1>
          <p className="mt-2 text-body text-ink-2">Reload to try again. If it keeps happening, share the reference with your admin.</p>
          {error.digest && <p className="mt-4 text-caption text-ink-3 tabular-nums select-all">Ref {error.digest}</p>}
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            {/* A full reload on purpose: the client router may be what broke. */}
            <a href="/dashboard" className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-body font-medium text-ink hover:bg-sunken md:h-10">
              Go to dashboard
            </a>
            <button type="button" onClick={reset} className="h-11 rounded-md bg-brand px-4 text-body font-medium text-on-brand hover:bg-brand-hover md:h-10">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
