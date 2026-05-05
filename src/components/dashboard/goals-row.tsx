import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ProgressBar, spendCapTone } from '@/components/goals/progress-bar';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { formatCurrency, formatPercent } from '@/lib/utils';

type Props = {
  goals: GoalWithProgress[];
};

/**
 * Horizontally scrollable goals row — replaces the previous Card-list
 * shape. Each goal becomes a fixed-width tile; the row scrolls on
 * overflow. Mirrors the urgency sort that the old strip used.
 */
export function GoalsRow({ goals }: Props) {
  if (goals.length === 0) return null;

  const sorted = [...goals].sort(urgencyCompare);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            Goals
          </p>
          <h2 className="mt-1 text-sm font-medium">
            {sorted.length} active · sorted by urgency
          </h2>
        </div>
        <Link
          href="/goals"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground"
        >
          All goals
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
        // Each tile is a snap stop so the row reads as a deliberate
        // collection, not a scrubby continuous strip.
      >
        {sorted.map((g) => (
          <GoalTile key={g.id} goal={g} />
        ))}
      </div>
    </section>
  );
}

function GoalTile({ goal }: { goal: GoalWithProgress }) {
  const p = goal.progress;
  const fraction = Math.min(1, p.fraction);

  const headValue =
    p.type === 'savings'
      ? formatCurrency(p.current)
      : formatCurrency(p.spent);
  const headTotal =
    p.type === 'savings' ? formatCurrency(p.target) : formatCurrency(p.cap);

  return (
    <Link
      href={`/goals/${goal.id}/edit`}
      className="group flex w-64 shrink-0 snap-start flex-col gap-3 rounded-card border border-border bg-surface-elevated p-4 transition-colors duration-fast ease-out-quart hover:border-foreground/20"
    >
      <div className="space-y-1">
        <p className="truncate text-sm font-medium">{goal.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {tileSubtitle(goal)}
        </p>
      </div>
      <div className="space-y-1.5">
        <ProgressBar
          fraction={fraction}
          tone={
            p.type === 'savings'
              ? p.fraction >= 1
                ? 'positive'
                : 'neutral'
              : spendCapTone(p.fraction)
          }
        />
        <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums">
          <span className="text-foreground">
            {headValue}{' '}
            <span className="text-muted-foreground">of {headTotal}</span>
          </span>
          <span
            className={
              p.type === 'spend_cap' && p.fraction > 1
                ? 'text-destructive'
                : 'text-muted-foreground'
            }
          >
            {formatPercent(p.fraction)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function tileSubtitle(goal: GoalWithProgress): string {
  const p = goal.progress;
  if (p.type === 'savings') {
    if (p.remaining === 0) return 'Target hit';
    if (p.monthlyVelocity > 0 && p.projectedDate) {
      return `+${formatCurrency(p.monthlyVelocity)}/mo · ${formatTargetDate(p.projectedDate)}`;
    }
    return p.monthlyVelocity <= 0
      ? 'Not on track at current pace'
      : `${formatCurrency(p.remaining)} to go`;
  }
  if (p.fraction > 1) {
    return `Over by ${formatCurrency(-p.remaining)}`;
  }
  if (p.projectedMonthly > p.cap) {
    return `On pace to exceed cap`;
  }
  return `${formatCurrency(p.remaining)} left this month`;
}

function formatTargetDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function urgencyCompare(
  a: GoalWithProgress,
  b: GoalWithProgress,
): number {
  return urgencyScore(b) - urgencyScore(a);
}

function urgencyScore(g: GoalWithProgress): number {
  if (g.progress.type === 'spend_cap') {
    if (g.progress.fraction > 1) return 1000 + g.progress.fraction;
    if (g.progress.fraction >= 0.8) return 800 + g.progress.fraction * 100;
    return 100 + g.progress.fraction * 100;
  }
  if (g.progress.fraction >= 1) return 50;
  return 500 + g.progress.fraction * 100;
}
