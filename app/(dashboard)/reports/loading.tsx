import { Skeleton } from "@/components/ui/skeleton";

/** Matches the reports layout: header, left rail, filter bar, stat row, table. */
export default function ReportsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading reports">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32 rounded-xs" />
          <Skeleton className="h-8 w-40 rounded-xs" />
          <Skeleton className="h-5 w-80 max-w-full rounded-xs" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex gap-1.5 overflow-hidden lg:flex-col lg:gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-32 shrink-0 rounded-full lg:h-9 lg:w-full lg:rounded-md" />
          ))}
        </div>
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48 rounded-xs" />
            <Skeleton className="h-5 w-96 max-w-full rounded-xs" />
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl bg-surface shadow-card p-3">
            <Skeleton className="h-10 w-80 max-w-full rounded-md" />
            <Skeleton className="h-10 w-36 rounded-md" />
            <Skeleton className="h-10 w-48 rounded-md" />
            <Skeleton className="h-10 w-56 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-surface shadow-card p-4">
                <Skeleton className="h-4 w-20 rounded-xs" />
                <Skeleton className="h-8 w-[72px] rounded-xs" />
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl bg-surface shadow-card">
            <div className="h-10 border-b border-line bg-sunken" />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-6 border-b border-line px-4 py-3 last:border-0">
                <Skeleton className="h-4 w-40 rounded-xs" />
                <Skeleton className="ml-auto h-4 w-12 rounded-xs" />
                <Skeleton className="h-4 w-12 rounded-xs" />
                <Skeleton className="h-4 w-12 rounded-xs" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
