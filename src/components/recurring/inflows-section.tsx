import {
  frequencyToMonthlyMultiplier,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';
import { formatCurrency } from '@/lib/utils';
import { StreamRow } from './stream-row';

type Props = {
  streams: RecurringStreamRow[];
};

export function InflowsSection({ streams }: Props) {
  const total = streams.reduce((sum, s) => {
    if (s.averageAmount == null) return sum;
    return (
      sum +
      Math.abs(s.averageAmount) *
        frequencyToMonthlyMultiplier(s.frequency)
    );
  }, 0);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Inflows
          </p>
          <p className="mt-0.5 text-xs text-[--text-3]">
            {streams.length} {streams.length === 1 ? 'stream' : 'streams'}
          </p>
        </div>
        <p className="font-mono text-sm font-medium tabular-nums text-positive">
          {formatCurrency(total)}/mo
        </p>
      </header>
      <ul className="divide-y divide-[--border]/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow key={s.id} stream={s} variant="inflow" />
        ))}
      </ul>
    </section>
  );
}
