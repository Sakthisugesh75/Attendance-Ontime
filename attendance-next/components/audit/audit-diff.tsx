"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DiffRow } from "./audit-utils";

const KIND_LABEL = { added: "Added", removed: "Removed", changed: "Changed", same: "Unchanged" } as const;

function Value({ text, tone, multiline }: { text: string | null; tone: "before" | "after" | "same"; multiline: boolean }) {
  if (text === null) return <span className="text-caption text-ink-3 italic">not set</span>;
  if (text === "") return <span className="text-caption text-ink-3 italic">empty</span>;
  return (
    <span
      className={cn(
        "block rounded-xs px-2 py-1 text-cell break-all whitespace-pre-wrap tabular-nums",
        multiline && "max-h-64 overflow-auto",
        tone === "before" && "bg-danger-subtle text-st-absent-fg line-through decoration-danger",
        tone === "after" && "bg-st-present-tint text-st-present-fg",
        tone === "same" && "text-ink-3",
      )}
    >
      {text}
    </span>
  );
}

/**
 * Field-level before → after view of one audit entry. Changed fields are highlighted
 * (before struck through, after tinted); unchanged ones are collapsed behind a toggle.
 */
export function AuditDiff({ rows }: { rows: DiffRow[] }) {
  const [showSame, setShowSame] = useState(false);
  if (!rows.length) return <p className="text-body text-ink-2">No field changes were recorded for this entry.</p>;

  const changed = rows.filter((r) => r.kind !== "same");
  const same = rows.length - changed.length;
  const visible = showSame ? rows : changed;
  const onlyAfter = rows.every((r) => r.kind === "added");
  const onlyBefore = rows.every((r) => r.kind === "removed");

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(8rem,12rem)_1fr_auto_1fr] gap-3 border-b border-line bg-sunken px-3 py-2 sm:grid">
          <span className="text-col-header text-ink-3">Field</span>
          {onlyAfter || onlyBefore ? (
            <span className="text-col-header text-ink-3 col-span-3">{onlyAfter ? "Value" : "Value before"}</span>
          ) : (
            <>
              <span className="text-col-header text-ink-3">Before</span>
              <span className="w-4" />
              <span className="text-col-header text-ink-3">After</span>
            </>
          )}
        </div>
        <ul className="divide-y divide-line">
          {!visible.length && <li className="px-3 py-2.5 text-body text-ink-2">Saved without changing any field.</li>}
          {visible.map((r) => (
            <li key={r.key} className="grid gap-1.5 px-3 py-2.5 sm:grid-cols-[minmax(8rem,12rem)_1fr_auto_1fr] sm:items-start sm:gap-3">
              <span className="flex items-center gap-2 sm:pt-1">
                <span className={cn("text-cell break-all", r.kind === "same" ? "text-ink-3" : "font-medium text-ink")}>{r.key}</span>
                {r.kind !== "same" && r.kind !== "changed" && (
                  <span className="rounded-xs bg-sunken px-1.5 text-caption text-ink-2">{KIND_LABEL[r.kind]}</span>
                )}
              </span>
              {r.kind === "same" || onlyAfter || onlyBefore ? (
                // One value: unchanged, or an entry that only has an "after" (create) or "before" (delete)
                <span className="sm:col-span-3">
                  <Value text={onlyBefore ? r.before : r.after} tone={r.kind === "same" ? "same" : onlyBefore ? "before" : "after"} multiline={r.multiline} />
                </span>
              ) : (
                <>
                  <Value text={r.before} tone={r.before === null ? "same" : "before"} multiline={r.multiline} />
                  <ArrowRight aria-label="changed to" className="hidden size-4 text-ink-3 sm:mt-1 sm:block" />
                  <Value text={r.after} tone={r.after === null ? "same" : "after"} multiline={r.multiline} />
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      {same > 0 && (
        <button type="button" onClick={() => setShowSame((s) => !s)} className="mt-1 -mb-2 py-2 text-caption text-brand-ink underline-offset-4 hover:underline">
          {showSame ? "Hide unchanged fields" : `Show ${same} unchanged field${same > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
