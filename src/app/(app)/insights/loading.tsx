import { Skeleton } from '@/components/ui/skeleton';

export default function InsightsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <article className="space-y-5 rounded-card border border-border bg-surface-elevated p-6 sm:p-8">
        <header className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-3 w-28" />
        </header>
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </article>
    </div>
  );
}
