import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { StreamRow } from './stream-row';

type Props = {
  streams: RecurringStreamRow[];
};

/**
 * 90-day TOMBSTONED window. Low-emphasis chrome (StreamRow's cancelled
 * variant carries opacity-60). Renders only when caller passes >0
 * streams. The full all-time archive lives in the Cancelled tab via
 * <CancelledArchiveList>.
 */
export function RecentlyCancelledSection({ streams }: Props) {
  return (
    <section className="space-y-3">
      <header>
        <p className="text-eyebrow">
          Recently cancelled
        </p>
        <p className="mt-0.5 text-xs text-[--text-3]">
          {streams.length} {streams.length === 1 ? 'stream' : 'streams'} · last 90 days
        </p>
      </header>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow key={s.id} stream={s} variant="cancelled" />
        ))}
      </ul>
    </section>
  );
}
