import { Skeleton } from "@/components/ui/skeleton";

export default function DailyReportsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading daily reports">
      <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-44 rounded-md" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[5rem] w-[4.25rem] shrink-0 rounded-lg" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-56" />
        </div>
        <div className="space-y-3 px-5 py-5">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
