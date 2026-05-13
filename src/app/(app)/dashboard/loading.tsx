import { Skeleton } from '@/components/ui/skeleton';

/**
 * Streaming skeleton for /dashboard. Matches the final 7-card layout
 * shape so the page doesn't reflow when data lands. Hero uses the
 * gradient shimmer for richness; the rest use plain animate-pulse via
 * the shadcn <Skeleton> primitive.
 *
 * Next.js App Router auto-renders this between navigation and the
 * server component's await — no client wiring required.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-8 sm:py-10">
      {/* Hero — gradient shimmer matches final --gradient-hero canvas */}
      <div className="relative overflow-hidden rounded-card animate-hero-shimmer p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-3">
            <div className="h-3 w-20 rounded bg-white/15" />
            <div className="h-12 w-64 rounded bg-white/20" />
            <div className="h-5 w-40 rounded bg-white/10" />
          </div>
          <div className="h-14 w-full rounded bg-white/10 md:w-72" />
        </div>
      </div>

      {/* Split card */}
      <div className="grid grid-cols-1 divide-y divide-border rounded-2xl border border-[--hairline] bg-[--surface] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2 p-5 sm:p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Goals row */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="-mx-1 flex gap-3 overflow-hidden px-1 pb-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex w-64 shrink-0 flex-col gap-3 rounded-2xl border border-[--hairline] bg-[--surface] p-4"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming recurring */}
      <CardSkeleton rowCount={3} />

      {/* Insight teaser */}
      <section className="rounded-2xl border border-[--hairline] bg-[--surface] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-9 w-9 rounded-pill" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <CardSkeleton rowCount={5} />
    </div>
  );
}

function CardSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <section className="rounded-2xl border border-[--hairline] bg-[--surface] p-5 sm:p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-3 w-16" />
      </header>
      <div className="space-y-3">
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
