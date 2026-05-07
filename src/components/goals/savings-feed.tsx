// src/components/goals/savings-feed.tsx
import type { SavingsFeedRow } from '@/lib/db/queries/goal-detail';
import { humanizeDate } from '@/lib/format/date';
import { cn, formatCurrency } from '@/lib/utils';

type Props = { rows: SavingsFeedRow[] };

export function SavingsFeed({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <section className="rounded-card border border-border bg-card p-5">
        <p className="text-eyebrow mb-2">Weekly contributions</p>
        <p className="text-sm text-muted-foreground">
          No activity on contributing accounts yet.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-card border border-border bg-card">
      <header className="border-b border-border px-5 py-3">
        <p className="text-eyebrow">Weekly contributions</p>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const isPositive = r.netDelta > 0;
          return (
            <li
              key={r.weekStart}
              className="flex items-baseline justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {humanizeDate(r.weekStart)} – {humanizeDate(r.weekEnd)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.txnCount} {r.txnCount === 1 ? 'transaction' : 'transactions'}
                </p>
              </div>
              <p
                className={cn(
                  'shrink-0 font-mono text-sm tabular-nums',
                  isPositive
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : r.netDelta < 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground',
                )}
              >
                {isPositive ? '+' : ''}
                {formatCurrency(r.netDelta)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
