import { Skeleton } from "@/components/ui/skeleton";

export default function AnnouncementsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading announcements">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-44 rounded-md" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
