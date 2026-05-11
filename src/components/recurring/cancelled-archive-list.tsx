import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { StreamRow } from './stream-row';

type Props = {
  streams: RecurringStreamRow[];
};

/**
 * Cancelled tab body. Full TOMBSTONED archive — no 90d filter; sorted
 * by lastDate desc by the caller (page.tsx). Renders the empty state
 * inline when the user has zero cancelled streams ever.
 */
export function CancelledArchiveList({ streams }: Props) {
  if (streams.length === 0) {
    return (
      <div className="rounded-card bg-[--surface] p-8 text-center">
        <p className="text-sm text-[--text-2]">No cancelled streams yet.</p>
        <p className="mt-1 text-xs text-[--text-3]">
          When a recurring charge stops appearing, it'll show up here.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          All cancelled
        </p>
        <p className="mt-0.5 text-xs text-[--text-3]">
          {streams.length} {streams.length === 1 ? 'stream' : 'streams'} · all-time
        </p>
      </header>
      <ul className="divide-y divide-[--border]/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow key={s.id} stream={s} variant="cancelled-archive" />
        ))}
      </ul>
    </section>
  );
}
