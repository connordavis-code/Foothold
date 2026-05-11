import { AlertTriangle } from 'lucide-react';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { HikeAlertRow } from './hike-alert-row';

type Props = {
  streams: RecurringStreamRow[];
};

/**
 * Amber-bordered block that surfaces stream(s) whose lastAmount is
 * >15% above averageAmount with a $2/mo monthly-equivalent floor.
 * Renders only when streams.length > 0 (caller-gated).
 */
export function HikeAlertBanner({ streams }: Props) {
  return (
    <section
      className="rounded-card border border-[--semantic-caution]/40 bg-[--semantic-caution]/5 p-4"
      role="region"
      aria-label="Hike alerts"
    >
      <header className="mb-3 flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 text-[--semantic-caution]"
          aria-hidden="true"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[--semantic-caution]">
          {streams.length} hike alert{streams.length === 1 ? '' : 's'}
        </p>
      </header>
      <ul className="divide-y divide-[--semantic-caution]/20">
        {streams.map((s) => (
          <HikeAlertRow key={s.id} stream={s} />
        ))}
      </ul>
    </section>
  );
}
