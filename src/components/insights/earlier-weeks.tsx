import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ArchiveEntry } from '@/lib/db/queries/insights';
import { firstSentence } from '@/lib/utils/first-sentence';

type Props = {
  entries: ArchiveEntry[];
  /** When viewing a past week, exclude that row from the list. */
  excludeWeekStart?: string | null;
};

function formatRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

export function EarlierWeeks({ entries, excludeWeekStart = null }: Props) {
  const rows = entries.filter((e) => e.weekStart !== excludeWeekStart);
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Earlier weeks
      </p>
      <div className="divide-y divide-border rounded-card border border-border bg-surface-elevated">
        {rows.map((entry) => {
          const lead = firstSentence(entry.narrativePreview);
          return (
            <Link
              key={entry.weekStart}
              href={`/insights?week=${entry.weekStart}`}
              className="flex items-center justify-between gap-4 px-5 py-3 text-foreground/80 transition-colors hover:bg-accent/30 hover:text-foreground"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs tabular-nums text-foreground/70">
                  {formatRange(entry.weekStart, entry.weekEnd)}
                </p>
                {lead && (
                  <p className="mt-0.5 truncate text-sm">{lead}</p>
                )}
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
