import { CircleCheck, CircleX, FileSpreadsheet, Hourglass, Undo2 } from "lucide-react";
import Link from "next/link";
import { UploadCard } from "@/components/import/upload-card";
import { PageHeader } from "@/components/layout/page-header";
import { listBatches } from "@/lib/import/service";
import { requirePermission } from "@/lib/session";
import { formatDate, formatTime, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Import Excel" };

const STATUS = {
  PREVIEW: { label: "Waiting for review", tone: "border border-dashed border-st-pending bg-st-pending-tint text-st-pending-fg", icon: Hourglass },
  DONE: { label: "Imported", tone: "bg-st-present-tint text-st-present-fg", icon: CircleCheck },
  UNDONE: { label: "Undone", tone: "bg-sunken text-ink-2", icon: Undo2 },
  FAILED: { label: "Failed", tone: "bg-st-absent-tint text-st-absent-fg", icon: CircleX },
} as const;

export default async function ImportPage() {
  await requirePermission("import.run");
  const batches = await listBatches();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import from Excel"
        description={
          <>
          Bring in your old attendance log. You&apos;ll see a full preview (who&apos;s in it, every auto-fix and anything unreadable) before anything is saved, and you can undo an import afterwards.
          </>
        }
      />

      <UploadCard />

      <section className="rounded-xl bg-surface shadow-card p-4 text-body sm:p-6">
        <h3 className="text-title-3 text-ink">What the file should look like</h3>
        <ul className="mt-3 grid list-disc gap-2 pl-5 text-ink-2 marker:text-ink-3 sm:grid-cols-2">
          <li>One sheet per month (e.g. &ldquo;Jan 26&rdquo;)</li>
          <li>Row 1: each employee&apos;s name above their columns</li>
          <li>
            Row 2: <span className="rounded-xs bg-sunken px-1 text-cell text-ink tabular-nums">Date | In | Out | Remarks</span>, repeated per person
          </li>
          <li>
            Dates like <span className="rounded-xs bg-sunken px-1 text-cell text-ink tabular-nums">21.01.2026</span> or real Excel dates; times like{" "}
            <span className="rounded-xs bg-sunken px-1 text-cell text-ink tabular-nums">09.45AM</span>
          </li>
          <li>Remarks: leave, WFH, half day, permission, shoot → statuses</li>
          <li>A row saying &ldquo;Sunday&rdquo; or a holiday name → off day for everyone</li>
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl bg-surface shadow-card">
        <h3 className="border-b border-line px-4 py-3 text-title-3 text-ink sm:px-5">Earlier uploads</h3>
        {batches.length === 0 ? (
          <p className="px-5 py-10 text-center text-body text-ink-2">Nothing uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/import/${b.id}`} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5">
                  <FileSpreadsheet aria-hidden className="size-5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{b.fileName}</span>
                    <span className="block text-caption text-ink-3 tabular-nums">
                      {formatDate(istDate(b.createdAt))}, {formatTime(b.createdAt)} · {b.by}
                      {b.range && ` · ${formatDate(b.range.from)} – ${formatDate(b.range.to)}`} · {b.people} people
                      {b.days !== null && ` · ${b.days} days imported`}
                    </span>
                  </span>
                  <StatusPill status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: keyof typeof STATUS }) {
  const { label, tone, icon: Icon } = STATUS[status];
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 text-caption font-semibold whitespace-nowrap", tone)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
