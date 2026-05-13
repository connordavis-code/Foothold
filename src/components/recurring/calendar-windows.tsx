import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import type { CalendarBuckets } from '@/lib/recurring/calendar-windows';
import { monthlyCost } from '@/lib/recurring/analysis';
import { formatCurrency } from '@/lib/utils';
import { StreamRow } from './stream-row';

type Props = {
  windows: CalendarBuckets;
};

/**
 * Renders up to 4 calendar window groups (THIS WEEK / LATER THIS
 * MONTH / NEXT MONTH / LATER) from groupByDateWindow output. Each
 * group renders only when its bucket has streams. Group sub-line
 * shows the date range; group total shows monthly-equivalent sum.
 */
export function CalendarWindows({ windows }: Props) {
  return (
    <div className="space-y-6">
      <Window
        label="This week"
        streams={windows.thisWeek}
        rangeFormatter={formatRange}
      />
      <Window
        label="Later this month"
        streams={windows.laterThisMonth}
        rangeFormatter={formatRange}
      />
      <Window
        label="Next month"
        streams={windows.nextMonth}
        rangeFormatter={formatRange}
      />
      <Window
        label="Later"
        streams={windows.beyond}
        rangeFormatter={formatRange}
      />
    </div>
  );
}

function Window({
  label,
  streams,
  rangeFormatter,
}: {
  label: string;
  streams: RecurringStreamRow[];
  rangeFormatter: (streams: RecurringStreamRow[]) => string;
}) {
  if (streams.length === 0) return null;
  const total = streams.reduce((sum, s) => sum + monthlyCost(s), 0);
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-eyebrow">
            {label}
          </p>
          <p className="mt-0.5 text-xs text-[--text-3]">
            {streams.length} {streams.length === 1 ? 'charge' : 'charges'} ·{' '}
            {rangeFormatter(streams)}
          </p>
        </div>
        <p className="font-mono text-sm font-medium tabular-nums text-[--text-2]">
          {formatCurrency(total)}/mo total
        </p>
      </header>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow
            key={s.id}
            stream={s}
            variant="outflow"
            showDate
            showTrend
          />
        ))}
      </ul>
    </section>
  );
}

function formatRange(streams: RecurringStreamRow[]): string {
  if (streams.length === 0) return '';
  const first = streams[0].predictedNextDate;
  const last = streams[streams.length - 1].predictedNextDate;
  if (!first || !last) return '';
  if (first === last) return formatShort(first);
  return `${formatShort(first)} → ${formatShort(last)}`;
}

function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
