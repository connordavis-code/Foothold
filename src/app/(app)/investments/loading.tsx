import { Skeleton } from '@/components/ui/skeleton';

const HOLDINGS_ROW_COUNT = 8;
const TXN_ROW_COUNT = 5;

/**
 * Streaming skeleton for /investments. Matches the operator layout —
 * eyebrow + title, 3-cell summary grid, holdings table, recent
 * investment txns table — so the page doesn't reflow.
 */
export default function InvestmentsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-44" />
      </div>

      {/* Portfolio summary — 3 cells */}
      <div className="grid grid-cols-1 divide-y divide-border rounded-card border border-border bg-surface-elevated md:grid-cols-3 md:divide-x md:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 p-5 sm:p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Holdings */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-44 rounded-pill" />
        </div>
        <TableSkeleton rowCount={HOLDINGS_ROW_COUNT} />
      </div>

      {/* Recent investment txns */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-44" />
        <TableSkeleton rowCount={TXN_ROW_COUNT} />
      </div>
    </div>
  );
}

function TableSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
      <div className="border-b border-border px-3 py-2">
        <Skeleton className="h-3 w-44" />
      </div>
      {Array.from({ length: rowCount }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
        >
          <Skeleton className="h-4 w-12 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="hidden h-4 w-16 sm:block" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
