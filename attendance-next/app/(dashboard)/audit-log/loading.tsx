import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLogLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading audit log">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-card">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <Skeleton className="h-10 w-full sm:w-56" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-44" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="hidden h-3.5 w-28 sm:block" />
              <Skeleton className="ml-auto hidden h-3.5 w-24 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
