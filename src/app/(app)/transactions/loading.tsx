import { Skeleton } from '@/components/ui/skeleton';

const SKELETON_ROW_COUNT = 12;

/**
 * Streaming skeleton for /transactions. Matches the operator-tier
 * layout (filter row + sticky-header table + pagination). 12 rows is
 * enough to cover the typical viewport without scroll, so the page
 * feels "full" before data lands.
 */
export default function TransactionsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-44" />
        </div>
        <Skeleton className="h-3 w-28" />
      </div>

      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 flex-1 min-w-[220px] rounded-card" />
        <Skeleton className="h-9 w-32 rounded-card" />
        <Skeleton className="h-9 w-36 rounded-card" />
        <Skeleton className="h-9 w-32 rounded-card" />
        <Skeleton className="h-9 w-32 rounded-card" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[--hairline] bg-[--surface]">
        <div className="border-b border-border px-3 py-2">
          <div className="flex gap-3 text-[10px] uppercase tracking-[0.08em]">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="ml-2 h-3 w-20" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        </div>
        <div>
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
            >
              <Skeleton className="h-4 w-16 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32 opacity-70" />
              </div>
              <Skeleton className="hidden h-3 w-24 sm:block" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Skeleton className="h-4 w-44" />
      </div>
    </div>
  );
}
