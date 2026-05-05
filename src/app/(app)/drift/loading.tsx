import { Skeleton } from '@/components/ui/skeleton';

export default function DriftLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <section className="space-y-3">
        <Skeleton className="h-3 w-44" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-card border border-border bg-surface-elevated p-4"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12 rounded-pill" />
              </div>
              <Skeleton className="mt-3 h-7 w-24" />
              <Skeleton className="mt-1 h-3 w-32" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-48" />
        <div className="rounded-card border border-border bg-surface-elevated p-4">
          <Skeleton className="h-64 w-full" />
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
            >
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
