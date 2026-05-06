import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { groupByCategory, isHikeAlert, monthlyCost } from '@/lib/recurring/analysis';
import { formatCurrency } from '@/lib/utils';
import { HikeAlertRow } from './hike-alert-row';
import { StreamRow } from './stream-row';

type Props = {
  streams: RecurringStreamRow[];
};

export function RecurringOverview({ streams }: Props) {
  const hikes = streams.filter(isHikeAlert);
  const categoryGroups = groupByCategory(streams);
  const activeInflows = streams.filter(
    (s) => s.direction === 'inflow' && s.isActive,
  );
  const cancelled = streams
    .filter(isRecentlyCancelled)
    .sort(
      (a, b) =>
        Date.parse(b.lastDate ?? '1970-01-01') -
        Date.parse(a.lastDate ?? '1970-01-01'),
    );

  return (
    <div className="space-y-6">
      {hikes.length > 0 && (
        <Section
          eyebrow={`Hike alert · ${hikes.length} ${plural(hikes.length, 'stream')}`}
        >
          {hikes.map((s) => (
            <HikeAlertRow key={s.id} stream={s} />
          ))}
        </Section>
      )}

      {categoryGroups.map((g) => (
        <Section
          key={g.category ?? '__other__'}
          eyebrow={`${g.humanLabel} · ${g.streams.length} ${plural(g.streams.length, 'stream')} · ${formatCurrency(g.total)}/mo`}
        >
          {g.streams.map((s) => (
            <StreamRow key={s.id} stream={s} variant="outflow" />
          ))}
        </Section>
      ))}

      {activeInflows.length > 0 && (
        <Section
          eyebrow={`Inflows · ${activeInflows.length} ${plural(activeInflows.length, 'stream')} · ${formatCurrency(inflowMonthlyTotal(activeInflows))}/mo`}
        >
          {activeInflows.map((s) => (
            <StreamRow key={s.id} stream={s} variant="inflow" />
          ))}
        </Section>
      )}

      {cancelled.length > 0 && (
        <Section
          eyebrow={`Recently cancelled · ${cancelled.length} ${plural(cancelled.length, 'stream')}`}
        >
          {cancelled.map((s) => (
            <StreamRow key={s.id} stream={s} variant="cancelled" />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="text-eyebrow">{eyebrow}</p>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-card border border-border bg-surface-elevated">
        {children}
      </ul>
    </section>
  );
}

function inflowMonthlyTotal(streams: RecurringStreamRow[]): number {
  return streams.reduce((sum, s) => sum + monthlyCost(s), 0);
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
function isRecentlyCancelled(stream: RecurringStreamRow): boolean {
  if (stream.status !== 'TOMBSTONED') return false;
  if (!stream.lastDate) return false;
  const last = Date.parse(stream.lastDate);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last <= NINETY_DAYS_MS;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
