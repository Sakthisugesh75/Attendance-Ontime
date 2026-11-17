import { Skeleton } from "@/components/ui/skeleton";

/** Matches the muster layout: header, toolbar, legend, then 36px cells beside the name column. */
export default function MusterLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the muster roll">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40 rounded-xs bg-sunken" />
          <Skeleton className="h-8 w-56 rounded-xs bg-sunken" />
          <Skeleton className="h-5 w-96 max-w-full rounded-xs bg-sunken" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-40 rounded-md bg-sunken" />
          <Skeleton className="h-10 w-28 rounded-md bg-sunken" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-card">
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
          <Skeleton className="h-10 w-56 rounded-md bg-sunken" />
          <Skeleton className="h-10 w-48 rounded-md bg-sunken" />
          <Skeleton className="h-10 w-60 rounded-md bg-sunken" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-xs bg-sunken" />
          ))}
        </div>
        <div className="h-14 border-b border-line bg-sunken" />
        <div className="space-y-0.5 overflow-hidden p-px">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-0.5">
              <div className="flex w-36 shrink-0 items-center gap-2.5 px-3 sm:w-[220px] sm:px-4">
                <Skeleton className="hidden size-7 shrink-0 rounded-full bg-sunken sm:block" />
                <Skeleton className="h-4 w-28 rounded-xs bg-sunken" />
              </div>
              {Array.from({ length: 24 }, (_, j) => (
                <Skeleton key={j} className="size-9 shrink-0 rounded-xs bg-sunken" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
