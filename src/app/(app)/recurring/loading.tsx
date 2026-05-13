import { Skeleton } from '@/components/ui/skeleton';

export default function RecurringLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-6 w-32" />
      </div>

      <div className="grid grid-cols-1 divide-y divide-border rounded-2xl border border-[--hairline] bg-[--surface] md:grid-cols-3 md:divide-x md:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 p-5 sm:p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {[0, 1].map((s) => (
        <section key={s} className="space-y-3">
          <Skeleton className="h-3 w-44" />
          <div className="overflow-hidden rounded-2xl border border-[--hairline] bg-[--surface]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
              >
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="hidden h-4 w-20 sm:block" />
                <Skeleton className="hidden h-4 w-20 sm:block" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
