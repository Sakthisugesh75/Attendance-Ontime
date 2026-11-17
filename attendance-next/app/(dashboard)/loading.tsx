import { Skeleton } from "@/components/ui/skeleton";

/** Generic page skeleton: header, a row of stat cards and a content panel (DESIGN.md §4.9). */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 max-w-full rounded-xs" />
        <Skeleton className="h-4 w-80 max-w-full rounded-xs" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl bg-surface shadow-card p-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-4 w-20 rounded-xs" />
              <Skeleton className="size-8 rounded-md" />
            </div>
            <Skeleton className="h-8 w-[72px] rounded-xs" />
            <Skeleton className="h-3 w-24 rounded-xs" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-40 rounded-xs" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex h-12 items-center gap-4 px-5">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3 rounded-xs" />
                <Skeleton className="h-3 w-1/5 rounded-xs" />
              </div>
              <Skeleton className="hidden h-[22px] w-20 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
