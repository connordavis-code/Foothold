import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { UpcomingRecurringRow } from '@/lib/db/queries/recurring';
import { humanizeCategory } from '@/lib/format/category';
import { formatCurrency } from '@/lib/utils';

type Props = {
  upcoming: UpcomingRecurringRow[];
  days?: number;
};

/**
 * Replaces the old monthly-total stat with an actionable 7-day window.
 * Empty state is intentional: when nothing is scheduled, hiding is
 * preferable to "0 charges this week" — clutter without information.
 */
export function UpcomingRecurringCard({ upcoming, days = 7 }: Props) {
  if (upcoming.length === 0) return null;

  const total = upcoming.reduce(
    (sum, r) => sum + (r.averageAmount ?? 0),
    0,
  );

  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-eyebrow">
            Recurring · next {days} days
          </p>
          <h2 className="mt-1 text-sm font-medium">
            {upcoming.length}{' '}
            {upcoming.length === 1 ? 'charge' : 'charges'} expected ·{' '}
            <span className="tabular-nums">{formatCurrency(total)}</span>
          </h2>
        </div>
        <Link
          href="/recurring"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground"
        >
          All recurring
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <ul className="space-y-1">
        {upcoming.map((r) => (
          <RecurringRow key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
}

function RecurringRow({ r }: { r: UpcomingRecurringRow }) {
  const drillHref = drilldownHref(r);
  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{pickLabel(r)}</p>
          <p className="text-xs text-muted-foreground">
            {formatHitDate(r.predictedNextDate)}
          </p>
        </div>
      </div>
      <p className="shrink-0 font-mono text-sm tabular-nums">
        {r.averageAmount != null ? formatCurrency(r.averageAmount) : '—'}
      </p>
    </>
  );

  if (drillHref) {
    return (
      <li>
        <Link
          href={drillHref}
          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors duration-fast ease-out-quart hover:bg-surface-sunken active:bg-surface-sunken"
        >
          {inner}
        </Link>
      </li>
    );
  }
  // Honest affordance: no merchant + no description → can't build a
  // useful filter target, so don't lie with a hover state either.
  return (
    <li className="flex items-center justify-between gap-3 rounded-md px-2 py-2">
      {inner}
    </li>
  );
}

// Plaid sandbox commonly returns empty merchantName + empty description
// for recurring streams (the /recurring table sees this too — most rows
// fall back to category). Order: real merchant → description → humanized
// category → generic literal. `||` instead of `??` so empty/whitespace
// strings fall through, not just nulls.
function pickLabel(r: {
  merchantName: string | null;
  description: string | null;
  primaryCategory: string | null;
}): string {
  return (
    r.merchantName?.trim() ||
    r.description?.trim() ||
    (r.primaryCategory ? humanizeCategory(r.primaryCategory) : '') ||
    'Recurring charge'
  );
}

// Match the /recurring stream-row drill pattern: q= ILIKEs txn name +
// merchantName, scoped to the last 180 days so we surface receipts
// that actually correlate to the predicted hit. Falls through when
// neither merchantName nor description is present — q=<category>
// would surface every category-mate as noise.
function drilldownHref(r: UpcomingRecurringRow): string | null {
  const term = r.merchantName?.trim() || r.description?.trim();
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


function formatHitDate(yyyymmdd: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (yyyymmdd === today) return 'Today';
  if (yyyymmdd === tomorrow) return 'Tomorrow';
  return new Date(`${yyyymmdd}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
