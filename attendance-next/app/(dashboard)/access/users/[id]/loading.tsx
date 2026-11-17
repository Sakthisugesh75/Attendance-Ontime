import { Skeleton } from "@/components/ui/skeleton";

export default function AccessUserLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading account activity">
      <Skeleton className="h-7 w-20" />
      <div className="rounded-xl bg-surface shadow-card">
        <div className="flex items-center gap-5 p-6">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-64 max-w-full" />
          </div>
        </div>
        <div className="grid gap-4 border-t p-6 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-surface shadow-card">
        <div className="border-b px-6 py-4">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="space-y-5 p-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
