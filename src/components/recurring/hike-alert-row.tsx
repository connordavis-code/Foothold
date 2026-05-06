import Link from 'next/link';
import {
  frequencyToMonthlyMultiplier,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';
import { humanizeCategory } from '@/lib/format/category';
import { hikeRatio } from '@/lib/recurring/analysis';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

type Props = {
  stream: RecurringStreamRow;
};

export function HikeAlertRow({ stream }: Props) {
  const ratio = hikeRatio(stream);
  if (ratio == null || stream.lastAmount == null || stream.averageAmount == null) {
    return null;
  }

  const label = pickLabel(stream);
  const drillHref = drilldownHref(stream);
  const deltaMonthly =
    (stream.lastAmount - stream.averageAmount) *
    frequencyToMonthlyMultiplier(stream.frequency);

  return (
    <li
      className={cn(
        'relative px-5 py-3 sm:px-6',
        drillHref &&
          'transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60',
      )}
    >
      {drillHref && (
        <Link
          href={drillHref}
          className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`See ${label} transactions`}
        />
      )}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="whitespace-nowrap font-mono text-sm font-medium tabular-nums">
            {formatCurrency(stream.lastAmount)}/mo
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              was {formatCurrency(stream.averageAmount)}
            </span>
          </p>
        </div>
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          +{formatPercent(ratio)} vs avg · +{formatCurrency(deltaMonthly)}/mo
        </p>
      </div>
    </li>
  );
}

function drilldownHref(stream: RecurringStreamRow): string | null {
  // See stream-row.tsx for the fallback rationale.
  const term = stream.merchantName?.trim() || stream.description?.trim();
  if (!term) return null;
  const params = new URLSearchParams();
  params.set('q', term);
  params.set('from', sixMonthsAgoIso());
  return `/transactions?${params.toString()}`;
}

function sixMonthsAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

function pickLabel(stream: RecurringStreamRow): string {
  return (
    stream.merchantName?.trim() ||
    stream.description?.trim() ||
    (stream.primaryCategory ? humanizeCategory(stream.primaryCategory) : '') ||
    'Recurring charge'
  );
}
