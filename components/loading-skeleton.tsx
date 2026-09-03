import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic page loading skeleton.
 * Used by Next.js loading.tsx files across the app.
 */
export function PageLoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      {/* Metric cards skeleton */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="mb-3 h-3 w-full" />
          <Skeleton className="mb-3 h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="rounded-xl border border-border p-5">
          <Skeleton className="mb-4 h-4 w-28" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
