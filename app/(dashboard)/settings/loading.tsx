import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true" aria-label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
        <div className="flex gap-1.5 overflow-hidden lg:flex-col">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-28 shrink-0 rounded-lg lg:h-11 lg:w-full" />
          ))}
        </div>
        <div className="space-y-8">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="grid gap-4 max-w-[720px]">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-52 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
