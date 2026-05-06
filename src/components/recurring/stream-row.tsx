import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { humanizeCategory } from '@/lib/format/category';
import { isHikeAlert, monthlyCost } from '@/lib/recurring/analysis';
import { cn, formatCurrency } from '@/lib/utils';

type Variant = 'outflow' | 'inflow' | 'cancelled';

type Props = {
  stream: RecurringStreamRow;
  variant: Variant;
};

export function StreamRow({ stream, variant }: Props) {
  if (variant === 'cancelled') return <CancelledRow stream={stream} />;

  const label = pickLabel(stream);
  const monthly = monthlyCost(stream);
  const drillHref = drilldownHref(stream);
  const showHikeGlyph = variant === 'outflow' && isHikeAlert(stream);

  return (
    <li className="relative px-5 py-3 sm:px-6">
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
          <p
            className={cn(
              'whitespace-nowrap font-mono text-sm font-medium tabular-nums',
              variant === 'inflow' && 'text-positive',
            )}
          >
            {formatCurrency(monthly)}/mo
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {humanizeFrequency(stream.frequency)}
            {variant === 'outflow' && stream.status === 'EARLY_DETECTION' && (
              <span className="ml-1.5 text-muted-foreground/80">· early</span>
            )}
          </p>
          {showHikeGlyph && (
            <AlertTriangle
              className="h-3.5 w-3.5 text-amber-500"
              aria-label="Hike detected"
            />
          )}
        </div>
      </div>
    </li>
  );
}

function CancelledRow({ stream }: { stream: RecurringStreamRow }) {
  const label = pickLabel(stream);
  const monthly = monthlyCost(stream);
  return (
    <li className="px-5 py-2 opacity-60 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-xs">
          {label}
          {stream.lastDate && (
            <span className="ml-2 text-muted-foreground">
              · last hit {formatLastHit(stream.lastDate)}
            </span>
          )}
        </p>
        <p className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
          {formatCurrency(monthly)}/mo
        </p>
      </div>
    </li>
  );
}

function drilldownHref(stream: RecurringStreamRow): string | null {
  const merchant = stream.merchantName?.trim();
  if (!merchant) return null;
  const params = new URLSearchParams();
  params.set('q', merchant);
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

function formatLastHit(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
