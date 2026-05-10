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
 * 7-day window of upcoming recurring charges. Empty state hides the
 * section entirely (no clutter when nothing is scheduled). Each row
 * drills to /transactions?q=<merchant>&from=<6mo> when a useful term is
 * available; otherwise renders as a non-interactive row (honest affordance).
 *
 * Renamed from <UpcomingRecurringCard> in R.2 to match the prototype's
 * naming. Data contract + drill heuristics preserved.
 */
export function RecurringList({ upcoming, days = 7 }: Props) {
  if (upcoming.length === 0) return null;

  const total = upcoming.reduce((sum, r) => sum + (r.averageAmount ?? 0), 0);

  return (
    <section className="rounded-card bg-[--surface] p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
            Recurring · next {days} days
          </div>
          <div className="mt-1 font-mono text-sm tabular-nums text-[--text]">
            {upcoming.length} {upcoming.length === 1 ? 'charge' : 'charges'}{' '}
            expected · {formatCurrency(total)}
          </div>
        </div>
        <Link
          href="/recurring"
          className="inline-flex items-center gap-1 text-xs text-[--text-2] hover:text-[--text]"
        >
          All recurring
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <ul className="mt-4 space-y-1">
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
        <CalendarClock className="h-4 w-4 shrink-0 text-[--text-3]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[--text]">
            {pickLabel(r)}
          </p>
          <p className="text-xs text-[--text-3]">
            {formatHitDate(r.predictedNextDate)}
          </p>
        </div>
      </div>
      <p className="shrink-0 font-mono text-sm tabular-nums text-[--text]">
        {r.averageAmount != null ? formatCurrency(r.averageAmount) : '—'}
      </p>
    </>
  );

  if (drillHref) {
    return (
      <li>
        <Link
          href={drillHref}
          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[--surface-2]"
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
