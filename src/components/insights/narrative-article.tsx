import type { Insight } from '@/lib/db/schema';
import { formatWeekRange } from '@/lib/utils/format-week-range';

type Props = {
  insight: Insight;
  isCurrentWeek: boolean;
  showStaleChip: boolean;
};

function formatGeneratedAt(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function NarrativeArticle({ insight, isCurrentWeek, showStaleChip }: Props) {
  return (
    <article className="space-y-5 rounded-card border border-border bg-surface-elevated p-6 sm:p-8">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            Week of
          </p>
          <p className="font-mono text-sm tabular-nums text-foreground">
            {formatWeekRange(insight.weekStart, insight.weekEnd)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Generated {formatGeneratedAt(insight.generatedAt)}
          {showStaleChip && !isCurrentWeek && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              · regenerate for current week
            </span>
          )}
        </p>
      </header>
      <div className="font-serif text-[17px] leading-[1.7] text-foreground/95 whitespace-pre-wrap">
        {insight.narrative}
      </div>
    </article>
  );
}
