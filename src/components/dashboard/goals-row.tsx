import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { formatCurrency, formatPercent } from '@/lib/utils';

type Props = {
  goals: GoalWithProgress[];
};

/**
 * 2-up responsive grid per R.2 prototype. Replaces the horizontally-
 * scrolling tile row. Each goal tile drills to /goals/[id]/edit. Urgency
 * sort preserved from R.1 implementation.
 */
export function GoalsRow({ goals }: Props) {
  if (goals.length === 0) return null;

  const sorted = [...goals].sort(urgencyCompare);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[--text]">Goals</h3>
          <p className="text-xs text-[--text-3]">
            {sorted.length} active · sorted by urgency
          </p>
        </div>
        <Link
          href="/goals"
          className="inline-flex items-center gap-1 text-xs text-[--text-2] hover:text-[--text]"
        >
          All goals
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
  const overCap = p.type === 'spend_cap' && p.fraction > 1;
  const onPaceOverCap = p.type === 'spend_cap' && !overCap && p.projectedMonthly > p.cap;

  // Spend-cap bar tone: positive/normal accent until pace warning kicks in.
  // Use Foothold complete-color semantic tokens (NOT --accent, which is an
  // HSL fragment that needs hsl() wrapping and silently fails as raw var()).
  const barColor =
    overCap || onPaceOverCap
      ? 'var(--semantic-caution)'
      : 'var(--semantic-success)';

  const headValue =
    p.type === 'savings' ? formatCurrency(p.current) : formatCurrency(p.spent);
  const headTotal =
    p.type === 'savings' ? formatCurrency(p.target) : formatCurrency(p.cap);

  return (
    <Link
      href={`/goals/${goal.id}/edit`}
      className="group flex flex-col gap-3 rounded-card bg-[--surface] p-4 transition-colors hover:bg-[--surface-2]"
    >
      <div className="space-y-1">
        <h4 className="truncate text-sm font-medium text-[--text]">
          {goal.name}
        </h4>
        <p className="truncate text-xs text-[--text-3]">{tileSubtitle(goal)}</p>
      </div>
      <div className="space-y-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full rounded-full"
            style={{ width: `${fraction * 100}%`, background: barColor }}
          />
        </div>
        <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums">
          <span className="text-[--text]">
            {headValue} <span className="text-[--text-3]">of {headTotal}</span>
          </span>
          <span
            style={{
              color: overCap ? 'var(--semantic-caution)' : 'var(--text-3)',
            }}
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

function urgencyCompare(a: GoalWithProgress, b: GoalWithProgress): number {
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
