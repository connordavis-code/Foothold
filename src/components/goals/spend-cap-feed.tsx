// src/components/goals/spend-cap-feed.tsx
import Link from 'next/link';
import type { SpendCapFeedRow } from '@/lib/db/queries/goal-detail';
import { humanizeCategory } from '@/lib/format/category';
import { humanizeDate } from '@/lib/format/date';
import { formatCurrency } from '@/lib/utils';

type Props = {
  rows: SpendCapFeedRow[];
  /** First categoryFilter entry, or null for "all categories". */
  categoryHref: string | null;
};

export function SpendCapFeed({ rows, categoryHref }: Props) {
  if (rows.length === 0) {
    return (
      <section className="rounded-card border border-border bg-card p-5">
        <p className="text-eyebrow mb-2">This month</p>
        <p className="text-sm text-muted-foreground">
          No spending matched this cap yet this month.
        </p>
      </section>
    );
  }
  const monthStart = new Date();
  monthStart.setDate(1);
  const fromIso = monthStart.toISOString().slice(0, 10);
  const viewAllHref = categoryHref
    ? `/transactions?category=${categoryHref}&from=${fromIso}`
    : `/transactions?from=${fromIso}`;
  return (
    <section className="rounded-card border border-border bg-card">
      <header className="flex items-baseline justify-between border-b border-border px-5 py-3">
        <p className="text-eyebrow">
          Top transactions · this month
        </p>
        <Link
          href={viewAllHref}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all →
        </Link>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-baseline justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {r.merchantName ?? r.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {humanizeDate(r.date)}
                {r.category && ` · ${humanizeCategory(r.category)}`}
                {' · '}
                {r.accountName}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm tabular-nums text-foreground">
              {formatCurrency(r.amount)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
