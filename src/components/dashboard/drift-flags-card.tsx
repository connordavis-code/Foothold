import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { humanizeCategory } from '@/lib/format/category';
import type { DriftFlag } from '@/lib/db/queries/drift';

type Props = {
  flags: DriftFlag[];
};

/**
 * Conditional alert card — surfaces only when /drift has flagged
 * categories elevated this week. Renders nothing for the empty state so
 * the dashboard sequence collapses cleanly.
 */
export function DriftFlagsCard({ flags }: Props) {
  if (flags.length === 0) return null;
  const top = flags[0]; // sorted by ratio desc upstream

  const heading =
    flags.length === 1
      ? `${humanizeCategory(top.category)} is up ${formatRatio(top.ratio)} this week`
      : `${flags.length} categories are running hot this week`;

  return (
    <Link
      href="/drift"
      className="group flex items-start gap-4 rounded-card border border-amber-500/40 bg-amber-500/8 p-5 transition-colors duration-fast ease-out-quart hover:bg-amber-500/12 dark:border-amber-400/30 dark:bg-amber-400/8"
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">{heading}</p>
        {flags.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            Highest: {humanizeCategory(top.category)} at {formatRatio(top.ratio)} of
            its 4-week median.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Median for this category over the past four weeks ran around{' '}
            {dollars(top.baselineWeekly)}/wk.
          </p>
        )}
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast ease-out-quart group-hover:translate-x-0.5" />
    </Link>
  );
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}×`;
}

function dollars(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
