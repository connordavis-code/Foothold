import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { trendIndicator } from '@/lib/recurring/calendar-windows';
import { humanizeCategory } from '@/lib/format/category';
import { isHikeAlert, monthlyCost } from '@/lib/recurring/analysis';
import { cn, formatCurrency } from '@/lib/utils';

type Variant = 'outflow' | 'inflow' | 'cancelled' | 'cancelled-archive';

type Props = {
  stream: RecurringStreamRow;
  variant: Variant;
  /** Render the date cell only when the parent is a calendar-window group. */
  showDate?: boolean;
  /** Render the trend glyph only for active outflows in calendar context. */
  showTrend?: boolean;
};

export function StreamRow({
  stream,
  variant,
  showDate = false,
  showTrend = false,
}: Props) {
  if (variant === 'cancelled' || variant === 'cancelled-archive') {
    return (
      <CancelledRow stream={stream} archive={variant === 'cancelled-archive'} />
    );
  }

  const label = pickLabel(stream);
  const monthly = monthlyCost(stream);
  const drillHref = drilldownHref(stream);
  const showHikeGlyph = variant === 'outflow' && isHikeAlert(stream);
  const trend = showTrend ? trendIndicator(stream) : null;

  return (
    <li
      className={cn(
        'relative px-5 py-3 sm:px-6',
        drillHref &&
          'transition-colors duration-fast ease-out-quart hover:bg-[--surface-sunken]/60',
      )}
    >
      {drillHref && (
        <Link
          href={drillHref}
          className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`See ${label} transactions`}
        />
      )}
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium text-[--text]">{label}</p>
            <p
              className={cn(
                'whitespace-nowrap font-mono text-sm font-medium tabular-nums',
                variant === 'inflow' ? 'text-positive' : 'text-[--text]',
              )}
            >
              {formatCurrency(monthly)}/mo
            </p>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <p className="text-xs text-[--text-3]">
              {showDate && stream.predictedNextDate && (
                <span className="mr-2 text-[--text-2]">
                  {formatNextDate(stream.predictedNextDate)}
                </span>
              )}
              {humanizeFrequency(stream.frequency)}
              {variant === 'outflow' && stream.status === 'EARLY_DETECTION' && (
                <span className="ml-1.5 text-[--text-3]/80">· early</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {showTrend && trend && <TrendGlyph trend={trend} />}
              {showHikeGlyph && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-[--semantic-caution]"
                  aria-label="Hike detected"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function CancelledRow({
  stream,
  archive,
}: {
  stream: RecurringStreamRow;
  archive: boolean;
}) {
  const label = pickLabel(stream);
  const monthly = monthlyCost(stream);
  return (
    <li className={cn('px-5 py-2 sm:px-6', archive ? 'opacity-70' : 'opacity-60')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-xs text-[--text-2]">
          {label}
          {stream.lastDate && (
            <span className="ml-2 text-[--text-3]">
              · last hit {formatLastHit(stream.lastDate)}
            </span>
          )}
        </p>
        <p className="whitespace-nowrap font-mono text-xs tabular-nums text-[--text-3]">
          {formatCurrency(monthly)}/mo
        </p>
      </div>
    </li>
  );
}

function TrendGlyph({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') {
    return (
      <span
        className="text-[--semantic-caution]"
        title="Trending up"
        aria-label="Trending up"
      >
        ↗
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span
        className="text-[--text-2]"
        title="Trending down"
        aria-label="Trending down"
      >
        ↘
      </span>
    );
  }
  return (
    <span className="text-[--text-3]" title="Flat" aria-label="Flat">
      —
    </span>
  );
}

function drilldownHref(stream: RecurringStreamRow): string | null {
  // Plaid sandbox often leaves merchantName empty but populates description
  // with the raw memo ("AMZN Mktp", "PAYPAL XYZ"). q= ILIKEs name +
  // merchantName, so a description search usually still finds the receipts.
  // Fall through to no-drill rather than category — q=<category> would
  // surface every category-mate as noise.
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

function humanizeFrequency(f: string): string {
  switch (f) {
    case 'WEEKLY':
      return 'Weekly';
    case 'BIWEEKLY':
      return 'Every 2 weeks';
    case 'SEMI_MONTHLY':
      return 'Twice a month';
    case 'MONTHLY':
      return 'Monthly';
    case 'ANNUALLY':
      return 'Annually';
    default:
      return 'Recurring';
  }
}

function formatNextDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatLastHit(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
