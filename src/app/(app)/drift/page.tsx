import { Activity, ArrowRight, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { TrendChart } from '@/components/drift/trend-chart';
import { Button } from '@/components/ui/button';
import { humanizeCategory } from '@/lib/format/category';
import {
  MIN_BASELINE,
  MIN_CURRENT,
  MIN_RATIO,
  getDriftAnalysis,
} from '@/lib/db/queries/drift';
import { cn, formatCurrency } from '@/lib/utils';

export default async function DriftPage() {
  const session = await auth();
  if (!session?.user) return null;

  const drift = await getDriftAnalysis(session.user.id);

  if (drift.baselineSparse) {
    return <SparseEmptyState />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-1.5">
        <p className="text-eyebrow">
          Today
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Drift</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Categories spending materially above their {drift.weeks}-week
          baseline. Flagged when current week is at least {MIN_RATIO}× the
          prior 4-week median (baseline ≥ {formatCurrency(MIN_BASELINE)},
          current ≥ {formatCurrency(MIN_CURRENT)}).
        </p>
      </div>

      {drift.currentlyElevated.length > 0 ? (
        <section className="space-y-3">
          <p className="text-eyebrow">
            Elevated this week ·{' '}
            {drift.currentlyElevated.length === 1
              ? '1 category'
              : `${drift.currentlyElevated.length} categories`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drift.currentlyElevated.map((flag) => (
              <ElevatedTile key={flag.category} flag={flag} />
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-pill bg-positive/10 text-positive">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Nothing elevated this week</p>
              <p className="text-xs text-muted-foreground">
                Every category is within {MIN_RATIO}× of its 4-week median.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <p className="text-eyebrow">
          Weekly trend · top {drift.topCategories.length} categories
        </p>
        <div className="rounded-card border border-border bg-surface-elevated p-4 sm:p-5">
          <TrendChart histories={drift.topCategories} />
        </div>
      </section>

      {drift.flagHistory.length > 0 && (
        <section className="space-y-3">
          <p className="text-eyebrow">
            Flag history · {drift.flagHistory.length}{' '}
            {drift.flagHistory.length === 1 ? 'flag' : 'flags'}
          </p>
          <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur">
                  <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                    <th className="px-3 py-2 text-left font-medium w-[120px]">
                      Week ending
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Category
                    </th>
                    <th className="px-3 py-2 text-right font-medium w-[120px]">
                      Spent
                    </th>
                    <th className="px-3 py-2 text-right font-medium w-[120px]">
                      Baseline
                    </th>
                    <th className="px-3 py-2 text-right font-medium w-[80px]">
                      Ratio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drift.flagHistory.map((flag) => (
                    <tr
                      key={`${flag.weekEnd}-${flag.category}`}
                      className="border-b border-border/60 transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60 last:border-b-0"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {flag.weekEnd}
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        {humanizeCategory(flag.category)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(flag.currentTotal)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatCurrency(flag.baselineWeekly)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                        {formatRatio(flag.ratio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ElevatedTile({
  flag,
}: {
  flag: {
    category: string;
    weekStart: string;
    weekEnd: string;
    currentTotal: number;
    baselineWeekly: number;
    ratio: number;
  };
}) {
  // Drill-target contract verified against /transactions filter-row:
  // category / from / to are the canonical search-param names.
  const drillHref =
    `/transactions?category=${encodeURIComponent(flag.category)}` +
    `&from=${flag.weekStart}&to=${flag.weekEnd}`;

  return (
    <Link
      href={drillHref}
      className="group block rounded-card border border-amber-500/40 bg-amber-500/8 p-4 transition-colors duration-fast ease-out-quart hover:bg-amber-500/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-amber-400/30 dark:bg-amber-400/8"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">
          {humanizeCategory(flag.category)}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          <TrendingUp className="h-3 w-3" />
          {formatRatio(flag.ratio)}
        </span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {formatCurrency(flag.currentTotal)}
      </p>
      <p className="text-xs text-muted-foreground">
        vs {formatCurrency(flag.baselineWeekly)} typical
      </p>
    </Link>
  );
}

function SparseEmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-accent text-foreground/80">
          <Activity className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Not enough history yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Drift detection needs 4+ weeks of transaction data to establish
            a baseline. Once Plaid has synced enough history, elevated
            categories will surface here weekly.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/transactions">
              View synced transactions
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatRatio(r: number): string {
  return `${r.toFixed(1)}×`;
}
